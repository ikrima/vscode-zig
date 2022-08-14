'use strict';
import * as vsc from 'vscode';
import * as lc from 'vscode-languageclient/node';
import { ZIG, ZLS } from '../constants';
import { DisposableBase } from '../utils/dispose';
import * as fs from '../utils/fs';
import { Logger, LogLevel, ScopedError } from '../utils/logging';
import * as path from '../utils/path';
import * as strings from '../utils/strings';
import { extCfg } from '../zigExt';

// class ZlsClient extends lc.LanguageClient {
//   private zlsLog!: Logger;
//   // Default implementation logs failures to output panel that's meant for extension debugging
//   // For user-interactive operations (e.g. applyFixIt, applyTweaks), bubble up the failure to users
//   override handleFailedRequest<T>(type: lc.MessageSignature, err: unknown, token: vsc.CancellationToken | undefined, defaultValue: T): T {
//     if (err instanceof lc.ResponseError && type.method === 'workspace/executeCommand') {
//       this.mainLog.error("Zls Client err", err);
//     }
//     return super.handleFailedRequest(type, token, err, defaultValue);
//   }
// }

export default class ZlsServices extends DisposableBase {
  private zlsChannel!: vsc.OutputChannel;
  private zlsTraceChannel!: vsc.OutputChannel;
  private zlsLog!: Logger;
  private zlsClient?: lc.LanguageClient | undefined;

  public activate(): void {
    this.zlsChannel = this.addDisposable(vsc.window.createOutputChannel(ZLS.outChanName));
    this.zlsTraceChannel = lc.Trace.fromString(extCfg.zls.trace.server.verbosity) !== lc.Trace.Off
      ? this.addDisposable(vsc.window.createOutputChannel(ZLS.traceChanName, 'json'))
      : this.zlsChannel;
    this.zlsLog = Logger.channelLogger(this.zlsChannel, LogLevel.warn);

    this.addDisposables(
      vsc.commands.registerCommand(ZLS.CmdId.start, async () => {
        await this.startClient();
      }),
      vsc.commands.registerCommand(ZLS.CmdId.stop, async () => {
        await this.stopClient();
      }),
      vsc.commands.registerCommand(ZLS.CmdId.restart, async () => {
        await this.stopClient();
        await this.startClient();
      }),
    );
    void this.startClient();
  }

  override async dispose(): Promise<void> {
    if (this.zlsClient) { await this.stopClient().catch(); }
    super.dispose();
  }

  private async startClient(): Promise<void> {
    if (this.zlsClient) {
      this.zlsLog.warn("Zls already started");
      return Promise.resolve();
    }
    this.zlsLog.info("Starting Zls...");
    const zig = extCfg.zig;
    const zls = extCfg.zls;
    const zlsArgs = <string[]>[];
    let zlsDbgPath = zls.debugBinary ?? zls.binary;
    const zlsDbgArgs = ["--debug-log"];
    const zlsCwd = !strings.isWhiteSpace(zig.buildRootDir)
      ? await fs.dirExists(zig.buildRootDir).then(exists => exists ? zig.buildRootDir : undefined)
      : undefined;

    try {
      if (zls.enableDebug && !zls.debugBinary) {
        this.zlsLog.warn(
          "Using Zls debug mode without `zls.debugBinary`;\n" +
          "  Fallback to `zls.binary`");
      }
      await Promise.all([
        !path.isAbsolute(zls.binary)
          ? Promise.resolve()
          : fs.fileExists(zls.binary).then(exists => exists
            ? Promise.resolve()
            : Promise.reject(ScopedError.make(
              `Zls executable not found at ${zls.binary}\n` +
              `  Please specify its path in your settings with 'zls.binary'`
            ))),
        (!zls.enableDebug || zlsDbgPath === zls.binary || !path.isAbsolute(zlsDbgPath))
          ? Promise.resolve()
          : fs.fileExists(zlsDbgPath).then(exists => {
            if (!exists) {
              this.zlsLog.warn(
                `Zls debug executable not found at ${zlsDbgPath}\n` +
                `  Please specify its path in your settings with 'zls.zlsDebugBinPath'\n` +
                `  Fallback to 'zls.binary'`);
              zlsDbgPath = zls.binary;
            }
            return Promise.resolve();
          }),
      ]);

      // Server Options
      const serverOptions: lc.Executable = zls.enableDebug
        ? {
          command: zlsDbgPath,
          args: zlsDbgArgs,
          options: { cwd: zlsCwd } as lc.ExecutableOptions
        }
        : {
          command: zls.binary,
          args: zlsArgs,
          options: { cwd: zlsCwd } as lc.ExecutableOptions
        };

      // Client Options
      const clientOptions: lc.LanguageClientOptions = {
        documentSelector: ZIG.documentSelector,
        diagnosticCollectionName: ZLS.diagnosticsName,
        outputChannel: this.zlsChannel,
        traceOutputChannel: this.zlsTraceChannel,
        revealOutputChannelOn: lc.RevealOutputChannelOn.Never,
        // middleware: {
        //   provideCodeLenses: (document: vsc.TextDocument, token: vsc.CancellationToken, next: lc.ProvideCodeLensesSignature ): vsc.ProviderResult<vsc.CodeLens[]> => {
        //     const client = this._client;
        //     const provideCodeLenses: ProvideCodeLensesSignature = (document, token) => {
        //       return client.sendRequest(CodeLensRequest.type, client.code2ProtocolConverter.asCodeLensParams(document), token).then((result) => {
        //         if (token.isCancellationRequested) {
        //           return null;
        //         }
        //         return client.protocol2CodeConverter.asCodeLenses(result, token);
        //       }, (error) => {
        //         return client.handleFailedRequest(CodeLensRequest.type, token, error, null);
        //       });
        //     };
        //     const middleware = client.middleware;
        //     return middleware.provideCodeLenses
        //       ? middleware.provideCodeLenses(document, token, provideCodeLenses)
        //       : provideCodeLenses(document, token);
        //   },
        //   resolveCodeLens:   (codeLens: vsc.CodeLens,    token: vsc.CancellationToken, next: lc.ResolveCodeLensSignature   ): vsc.ProviderResult<vsc.CodeLens> => {
        //   },
        //   provideDocumentHighlights: async (document: vsc.TextDocument, position: vsc.Position, token: vsc.CancellationToken, next: lc.ProvideDocumentHighlightsSignature) => {
        //     let highlights = await next(document, position, token);
        //     if (highlights && highlights.length > 0) { return highlights; }
        //     return null;
        //   },
        //   handleDiagnostics: (uri: vsc.Uri, diagnostics: vsc.Diagnostic[], next: lc.HandleDiagnosticsSignature): void => {
        //     diagnostics.forEach(d => {
        //       d.code = {
        //         value: d.code
        //           ? ((types.isNumber(d.code) || types.isString(d.code)) ? d.code : d.code.value)
        //           : "",
        //         target: uri,
        //       };
        //     });
        //     next(uri, diagnostics);
        //   },
        // },
      };

      // Create and start the language client
      this.zlsClient = new lc.LanguageClient(
        ZLS.langServerId,
        'Zig Language Server',
        serverOptions,
        clientOptions,
        zls.enableDebug,
      );
      await this.zlsClient.start();
    } catch (e) {
      this.zlsLog.error('Zls client failed to start', e);
      return Promise.reject();
    }
  }

  private async stopClient(): Promise<void> {
    const zlsClient = this.zlsClient;
    this.zlsClient = undefined;
    if (!(zlsClient?.needsStop())) {
      this.zlsLog.warn("Zls client already stopped");
      return Promise.resolve();
    }

    this.zlsLog.info("Stopping Zls...");
    return zlsClient.stop().catch(e => {
      this.zlsLog.error(`${ZLS.CmdId.stop} failed during dispose.`, e);
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
//   if (!extCfg.zig.getWithFallback('serverCompletionRanking', false)) {
//     return list;
//   }
//   const completionItems = utils.isArray(list) ? list : list!.items;
//   let items = completionItems.map(item => {
//     // Gets the prefix used by VSCode when doing fuzzymatch.
//     let prefix = document.getText(new vsc.Range((item.range as vsc.Range).start, position));
//     if (prefix) {
//       item.filterText = prefix + '_' + item.filterText;
//     }
//     return item;
//   });
//   return new vsc.CompletionList(items, true);
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
// this.zlsClient.clientOptions.errorHandler = this.zlsClient.createDefaultErrorHandler(extCfg.zig.getWithFallback('maxRestartCount', 0));
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
