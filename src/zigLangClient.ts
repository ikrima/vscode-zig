'use strict';
import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient/node';
import { fs, types, path, Logger, LogLevel } from './utils';
import { ExtConst, CmdConst } from "./zigConst";
import { zig_ext } from "./zigContext";
import { Disposable } from './utils/dispose';

class ZlsLanguageClient extends vscodelc.LanguageClient {
  // // Default implementation logs failures to output panel that's meant for extension debugging
  // // For user-interactive operations (e.g. applyFixIt, applyTweaks), bubble up the failure to users
  // handleFailedRequest<T>(type: vscodelc.MessageSignature, error: any, defaultValue: T): T {
  //   if (error instanceof vscodelc.ResponseError
  //     && type.method === 'workspace/executeCommand'
  //   ) {
  //     zlsContext.logger.error("ZlsLanguageClient error", error);
  //   }
  //   return super.handleFailedRequest(type, error, defaultValue);
  // }
}

class ZlsContext extends Disposable {
  private zlsChannel: vscode.OutputChannel;
  readonly logger: Logger;
  private zlsClient?: ZlsLanguageClient | undefined;

  constructor() {
    super();
    this.zlsChannel = vscode.window.createOutputChannel("Zig Language Server");
    this.logger = Logger.channelLogger(this.zlsChannel, LogLevel.warn);
    this.addDisposables(
      this.zlsChannel,
      vscode.commands.registerCommand(CmdConst.zls.start, async () => {
        await this.startClient();
      }),
      vscode.commands.registerCommand(CmdConst.zls.stop, async () => {
        await this.stopClient();
      }),
      vscode.commands.registerCommand(CmdConst.zls.restart, async () => {
        await this.stopClient();
        await this.startClient();
      }),
    );
  }

  override async dispose(): Promise<void> {
    if (this.zlsClient) { await this.stopClient().catch(); }
    super.dispose();
  }


  async startClient(): Promise<void> {
    if (this.zlsClient) {
      this.logger.warn("Client already started");
      return Promise.resolve();
    }
    this.logger.info("Starting Zls...");
    const zigCfg = zig_ext.zigCfg;
    zigCfg.reload();
    const zig = zigCfg.zig;
    const zls = zigCfg.zig.zls;
    const zlsArgs = <string[]>[];
    let zlsDbgPath = zls.debugBinary ?? zls.binary;
    const zlsDbgArgs = ["--debug-log"];
    const zlsCwd = types.isNonBlank(zig.buildRootDir)
      ? await fs.dirExists(zig.buildRootDir).then(exists => exists ? zig.buildRootDir : undefined)
      : undefined;

    try {
      if (zls.enableDebug && !zls.debugBinary) {
        this.logger.warn(
          "Using Zls debug mode without `zig.zls.debugBinary`;\n" +
          "  Fallback to `zig.zls.binary`");
      }
      await Promise.all([
        !path.isAbsolute(zls.binary)
          ? Promise.resolve()
          : fs.fileExists(zls.binary).then(exists => {
            if (!exists) {
              this.logger.error(
                `Failed to find zls executable ${zls.binary}\n` +
                `  Please specify its path in your settings with "zig.zls.binary"`);
            }
            return exists ? Promise.resolve() : Promise.reject();
          }),
        (!zls.enableDebug || zlsDbgPath === zls.binary || !path.isAbsolute(zlsDbgPath))
          ? Promise.resolve()
          : fs.fileExists(zlsDbgPath).then(exists => {
            if (!exists) {
              this.logger.error(
                `Failed to find zls debug executable ${zlsDbgPath}\n` +
                `  Please specify its path in your settings with "zig.zls.zlsDebugBinPath"\n` +
                `  Fallback to "zig.zls.binary"`);
            }
            zlsDbgPath = zls.binary;
            return Promise.resolve();
          }),
      ]);
    } catch {
      return Promise.reject();
    }

    // Server Options
    const serverOptions: vscodelc.Executable = zls.enableDebug
      ? {
        command: zlsDbgPath,
        args: zlsDbgArgs,
        options:  { cwd: zlsCwd  } as vscodelc.ExecutableOptions
      }
      : {
        command: zls.binary,
        args: zlsArgs,
        options:  { cwd: zlsCwd  } as vscodelc.ExecutableOptions
      };

    // Client Options
    const clientOptions: vscodelc.LanguageClientOptions = {
      documentSelector: ExtConst.documentSelector,
      outputChannel: this.zlsChannel,
      diagnosticCollectionName: ExtConst.zlsDiagnosticsName,
      revealOutputChannelOn: vscodelc.RevealOutputChannelOn.Never,
      // middleware: {
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
    };

    // Create the language client and start the client
    this.zlsClient = new ZlsLanguageClient(
      'zlsClient',
      'Zig Language Server Client',
      serverOptions,
      clientOptions,
      zls.enableDebug,
    );
    this.zlsClient.start();
    return this.zlsClient.onReady();
  }

  async stopClient(): Promise<void> {
    const zlsClient = this.zlsClient;
    this.zlsClient = undefined;
    if (!(zlsClient?.needsStop())) {
      this.logger.warn("Client already stopped");
      return Promise.resolve();
    }

    this.logger.info("Stopping Zls...");
    return zlsClient.stop().catch(e => {
      this.logger.error(`${CmdConst.zls.stop} failed during dispose.`, e);
      return Promise.reject();
    });
  }

}

export async function registerLangClient(): Promise<vscode.Disposable> {
  const zlsContext = new ZlsContext();
  await zlsContext.startClient();
  return zlsContext;
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
//   if (!zigCfg.zig.getWithFallback('serverCompletionRanking', false)) {
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
// this.zlsClient.clientOptions.errorHandler = this.zlsClient.createDefaultErrorHandler(zigCfg.zig.getWithFallback('maxRestartCount', 0));
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
