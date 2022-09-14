'use strict';
import * as vsc from 'vscode';
import * as lc from 'vscode-languageclient/node';
import { ZIG, ZLS } from '../constants';
import * as process from '../utils/process';
import { DisposableBase } from '../utils/dispose';
import * as fs from '../utils/fs';
import { Lazy } from '../utils/lazy';
import { Logger, LogLevel, ScopedError } from '../utils/logging';
import * as path from '../utils/path';
import * as strings from '../utils/strings';
import * as types from '../utils/types';
import { extCfg } from '../zigExt';
import * as which from 'which';

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

type ZlsOptions = {
  zlsArgs:          string[];
  zlsDbgArgs:       string[];
  zlsCwd:           string | undefined;
  zlsDebugMode:     boolean;
  zlsBinary:        string | undefined;
  zlsDbgBinary:     string | undefined;
};
export default class ZlsServices extends DisposableBase {
  private zlsChannel!:      vsc.OutputChannel;
  private zlsTraceChannel!: Lazy<vsc.OutputChannel>;
  private zlsLog!:          Logger;
  private _zlsOpts?:        ZlsOptions | undefined;
  private zlsClient?:       lc.LanguageClient | undefined;

  public activate(): void {
    this.zlsChannel = this.addDisposable(vsc.window.createOutputChannel(ZLS.outChanName));
    this.zlsTraceChannel = Lazy.create<vsc.OutputChannel>(() => {
      return lc.Trace.fromString(extCfg.zls.trace.server.verbosity) !== lc.Trace.Off
        ? this.addDisposable(vsc.window.createOutputChannel(ZLS.traceChanName, 'json'))
        : this.zlsChannel;
    });
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
      vsc.commands.registerCommand(ZLS.CmdId.openconfig, async () => {
        await this.openConfig();
      }),
    );
    void this.startClient();
  }

  override async dispose(): Promise<void> {
    if (this.zlsClient) { await this.stopClient().catch(); }
    super.dispose();
  }

  private async resolveZlsOptions(): Promise<ZlsOptions> {
    const resolveExePath = async (exePath: string): Promise<string> => {
      const zlsPath: string | null  = path.isAbsolute(exePath)
        ? exePath
        : which.sync(exePath, { nothrow: true });
      if (!zlsPath) { throw ScopedError.make(`path could not be found through \`which ${exePath}\``); }
      await Promise.all([
        fs.fileExists(zlsPath).then(exists => exists
          ? Promise.resolve()
          : Promise.reject(ScopedError.make(`path at ${zlsPath} is not a file`))),
        fs.access(zlsPath, fs.constants.R_OK | fs.constants.X_OK).then(
          _ => true,
          _ => Promise.reject(ScopedError.make(`path at ${zlsPath} is not an executable\n`)))
      ]);
      return zlsPath;
    };

    if (!this._zlsOpts) {
      const zlsArgs    = <string[]>[];
      const zlsDbgArgs = ["--enable-debug-log"];
      const zlsCwd     = !strings.isWhiteSpace(extCfg.zig.buildRootDir)
        ? await fs.dirExists(extCfg.zig.buildRootDir).then(exists => exists ? extCfg.zig.buildRootDir : undefined)
        : undefined;
      const zlsDebugMode = extCfg.zls.enableDebug;
      const zlsBinary = await resolveExePath(extCfg.zls.binary).catch(e => {
        this.zlsLog.error("`zls.binary` failed to resolve", e);
        return null;
      });

      let zlsDbgBinary: string | null = extCfg.zls.debugBinary;
      if (zlsDebugMode) {
        if (!zlsDbgBinary) {
          this.zlsLog.warn(
            "Using Zls debug mode without `zls.debugBinary`;\n" +
            "  Fallback to `zls.binary`");
          zlsDbgBinary = zlsBinary;
        }
        else {
          zlsDbgBinary = await resolveExePath(zlsDbgBinary).catch(e => {
            this.zlsLog.warn("`zls.zlsDebugBinPath` failed to resolve; Fallback to `zls.binary`", e);
            return zlsBinary;
          });
        }
      }
      this._zlsOpts = {
        zlsArgs:       zlsArgs,
        zlsDbgArgs:    zlsDbgArgs,
        zlsCwd:        zlsCwd,
        zlsDebugMode:  zlsDebugMode,
        zlsBinary:     zlsBinary    ?? undefined,
        zlsDbgBinary:  zlsDbgBinary ?? undefined,
      };
    }
    return this._zlsOpts;
  }

  private async startClient(): Promise<void> {
    if (this.zlsClient) {
      this.zlsLog.warn("Zls already started");
      return Promise.resolve();
    }
    this.zlsLog.info("Starting Zls...");

    try {
      const zlsOpts = await this.resolveZlsOptions();
      // Server Options
      const zlsExe = zlsOpts.zlsDebugMode ? zlsOpts.zlsDbgBinary : zlsOpts.zlsBinary;
      types.assertIsDefined(zlsExe);

      const serverOptions: lc.Executable = zlsOpts.zlsDebugMode
        ? {
          command: zlsExe,
          args: zlsOpts.zlsDbgArgs,
          options: { cwd: zlsOpts.zlsCwd } as lc.ExecutableOptions
        }
        : {
          command: zlsExe,
          args: zlsOpts.zlsArgs,
          options: { cwd: zlsOpts.zlsCwd } as lc.ExecutableOptions
        };

      // Client Options
      const clientOptions: lc.LanguageClientOptions = {
        documentSelector: ZIG.documentSelector,
        diagnosticCollectionName: ZLS.diagnosticsName,
        outputChannel: this.zlsChannel,
        traceOutputChannel: this.zlsTraceChannel.val,
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
        zlsOpts.zlsDebugMode,
      );
      await this.zlsClient.start();
    } catch (e) {
      this.zlsLog.error('Zls client failed to start', e);
      this.zlsClient = undefined;
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

  private async openConfig(): Promise<void> {
    const zlsOpts = await this.resolveZlsOptions().catch(_ => undefined);
    const zlsExe = zlsOpts ? (zlsOpts?.zlsDebugMode ? zlsOpts.zlsDbgBinary : zlsOpts.zlsBinary) : undefined;
    if (!zlsOpts || !zlsExe) {
      this.zlsLog.error("Could not resolve Zls Executable");
      return;
    }
    const { stdout, stderr } = await process.execFile(
      zlsExe,
      ['--show-config-path'],
      {
        encoding: 'utf8',
        cwd: zlsOpts.zlsCwd,
        shell: vsc.env.shell,
      }
    );
    if (!strings.isWhiteSpace(stderr)) {
      this.zlsLog.error(
        `Could not retrieve config file path: '${zlsExe} --show-config-path':\n` +
        `  ${stderr}`
      );
      return;
    }
    await vsc.window.showTextDocument(vsc.Uri.file(stdout.trimEnd()), { preview: false });
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
