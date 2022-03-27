'use strict';
import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient/node';
import { log, fs, types, path } from './utils';
import { ZigConst } from "./zigConst";
import { zigContext } from "./zigContext";

class ZlsLanguageClient extends vscodelc.LanguageClient {
  // // Default implementation logs failures to output panel that's meant for extension debugging
  // // For user-interactive operations (e.g. applyFixIt, applyTweaks), bubble up the failure to users
  // handleFailedRequest<T>(type: vscodelc.MessageSignature, error: any, defaultValue: T): T {
  //   if (error instanceof vscodelc.ResponseError
  //     && type.method === 'workspace/executeCommand'
  //   ) {
  //     vscode.window.showErrorMessage(error.message);
  //   }
  //   return super.handleFailedRequest(type, error, defaultValue);
  // }
}

export class ZlsContext implements vscode.Disposable {
  private zlsChannel: vscode.OutputChannel;
  private zlsClient?: ZlsLanguageClient | undefined;
  private registrations: vscode.Disposable[] = [];

  constructor() {
    this.zlsChannel = vscode.window.createOutputChannel("Zig Language Server");
    this.registrations.push(
      vscode.commands.registerCommand("zig.zls.start", async () => {
        await this.startClient();
      }),
      vscode.commands.registerCommand("zig.zls.stop", async () => {
        await this.stopClient();
      }),
      vscode.commands.registerCommand("zig.zls.restart", async () => {
        await this.stopClient();
        await this.startClient();
      }),
    );
  }

  dispose() { this.asyncDispose(); }

  async asyncDispose() {
    this.registrations.forEach(d => d.dispose());
    this.registrations = [];
    if (this.zlsClient) { await this.stopClient().catch(() => { }); }
    this.zlsChannel.dispose();
  }


  async startClient(): Promise<void> {
    if (this.zlsClient) {
      log.warn(this.zlsChannel, "Client already started");
      return Promise.resolve();
    }
    log.info(this.zlsChannel, "Starting Zls...");
    zigContext.reloadConfig();
    const zigCfg = zigContext.zigCfg;

    const zlsEnableDebug = zigCfg.zls_enableDebug;
    const zlsPath = zigCfg.zls_binPath;
    const zlsArgs = <string[]>[];
    let zlsDbgPath = zigCfg.zls_debugBinPath;
    const zlsDbgArgs = ["--debug-log"];
    const zlsCwd = !types.isBlankString(zigCfg.build_rootDir)
      ? await fs.dirExists(zigCfg.build_rootDir).then(exists => exists ? zigCfg.build_rootDir : undefined)
      : undefined;

    try {
      if (zlsEnableDebug && !zlsDbgPath) {
        log.warn(this.zlsChannel,
          "Using Zls debug mode without `zig.zls.debugBinPath`;\n" +
          "  Fallback to `zig.zls.binPath`");
      }
      zlsDbgPath = zlsDbgPath ?? zlsPath;
      await Promise.all([
        !path.isAbsolute(zlsPath)
          ? Promise.resolve()
          : fs.fileExists(zlsPath).then(exists => {
            if (!exists) {
              log.error(this.zlsChannel,
                `Failed to find zls executable ${zlsPath}\n` +
                `  Please specify its path in your settings with "zig.zls.binPath"`);
            }
            return exists ? Promise.resolve() : Promise.reject();
          }),
        (!zlsEnableDebug || zlsDbgPath === zlsPath || !path.isAbsolute(zlsDbgPath))
          ? Promise.resolve()
          : fs.fileExists(zlsDbgPath).then(exists => {
            if (!exists) {
              log.error(this.zlsChannel,
                `Failed to find zls debug executable ${zlsDbgPath}\n` +
                `  Please specify its path in your settings with "zig.zls.zlsDebugBinPath"\n` +
                `  Fallback to "zig.zls.binPath"`);
            }
            zlsDbgPath = zlsPath;
            return Promise.resolve();
          }),
      ]);
    } catch {
      return Promise.reject();
    }

    // Create the language client and start the client
    this.zlsClient = new ZlsLanguageClient(
      'zlsClient',
      'Zig Language Server Client',

      // Server Options
      <vscodelc.ServerOptions>{
        run: <vscodelc.Executable>{
          command: zlsPath,
          args: zlsArgs,
          options: { cwd: zlsCwd }
        },
        debug: <vscodelc.Executable>{
          command: zlsDbgPath,
          args: zlsDbgArgs,
          options: { cwd: zlsCwd }
        },
      },

      // Client Options
      <vscodelc.LanguageClientOptions>{
        documentSelector: ZigConst.documentSelector,
        outputChannel: this.zlsChannel,
        diagnosticCollectionName: ZigConst.zlsDiagnosticsName,
        revealOutputChannelOn: vscodelc.RevealOutputChannelOn.Never,
        // middleware:            <vscodelc.Middleware>{
        //   handleDiagnostics: (uri: vscode.Uri, diagnostics: vscode.Diagnostic[], next: vscodelc.HandleDiagnosticsSignature): void => {
        //     diagnostics.forEach(d => {
        //       d.code = {
        //         value: d.code
        //           ? ((Is.isNumber(d.code) || Is.isString(d.code)) ? d.code : d.code.value)
        //           : "",
        //         target: uri,
        //       };
        //     });
        //     next(uri, diagnostics);
        //   },
        // },
      },
      zlsEnableDebug,
    );
    this.zlsClient.start();
    return this.zlsClient.onReady();
  }

  async stopClient(): Promise<void> {
    const zlsClient = this.zlsClient;
    this.zlsClient = undefined;
    if (!(zlsClient?.needsStop())) {
      log.warn(this.zlsChannel, "Client already stopped");
      return Promise.resolve();
    }

    log.info(this.zlsChannel, "Stopping Zls...");
    return zlsClient.stop().catch(err => {
      log.error(this.zlsChannel, `zls.stop failed during dispose.\n  Error: ${err}`);
      return Promise.reject();
    });
  }

}


//#region todo: advanced options
// // We hack up the completion items a bit to prevent VSCode from re-ranking and throwing away all our delicious signals like type information
// // VSCode sorts by (fuzzymatch(prefix, item.filterText), item.sortText)
// // By adding the prefix to the beginning of the filterText, we get a perfect fuzzymatch score for every item
// // The sortText (which reflects clangd ranking) breaks the tie.
// // This also prevents VSCode from filtering out any results due to the differences in how fuzzy filtering is applies, e.g. enable dot-to-arrow fixes in completion
// // We also mark the list as incomplete to force retrieving new rankings: https://github.com/microsoft/language-server-protocol/issues/898
// provideCompletionItem: async (document, position, context, token, next) => {
//   let list = await next(document, position, context, token);
//   if (!zigCfg.getWithFallback('serverCompletionRanking', false)) {
//     return list;
//   }
//   const completionItems = utils.isArray(list) ? list : list!.items;
//   let items = completionItems.map(item => {
//     // Gets the prefix used by VSCode when doing fuzzymatch.
//     let prefix = document.getText(new vscode.Range((item.range as vscode.Range).start, position));
//     if (prefix) {
//       item.filterText = prefix + '_' + item.filterText;
//     }
//     return item;
//   });
//   return new vscode.CompletionList(items, true);
// },
// // VSCode applies fuzzy match only on the symbol name, thus it throws away all results if query token is a prefix qualified name
// //  By adding the containerName to the symbol name, it prevents VSCode from filtering out any results
// //    e.g. enable workspaceSymbols for qualified symbols
// //  Only make adjustment if query is qualified; otherwise we'd get suboptimal result ordering
// //    bc including the name's qualifier (if it has one) in symbol.name means
// //    vscode can no longer tell apart exact matches from partial matches
// provideWorkspaceSymbols: async (query, token, next) => {
//   let symbols = await next(query, token);
//   return symbols?.map(symbol => {
//     if (query.includes('::')) {
//       if (symbol.containerName) { symbol.name = `${symbol.containerName}::${symbol.name}`; }
//       symbol.containerName = ''; // Clean the containerName to avoid displaying it twice.
//     }
//     return symbol;
//   });
// },
//#endregion

//#region todo: custom language features
// this.zlsClient.clientOptions.errorHandler = this.zlsClient.createDefaultErrorHandler(zigCfg.getWithFallback('maxRestartCount', 0));
// this.zlsClient.registerFeature(new EnableEditsNearCursorFeature);
// typeHierarchy.activate(this);
// inlayHints.activate(this);
// memoryUsage.activate(this);
// ast.activate(this);
// openConfig.activate(this);
// fileStatus.activate(this);
// switchSourceHeader.activate(this);
// configFileWatcher.activate(this);
//#endregion
