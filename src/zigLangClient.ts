'use strict';

import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient/node';
import * as utils from './utils';
import { ZigConfig } from "./zigConfig";

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
  private zlsDiagnostics: vscode.DiagnosticCollection;
  private zlsChannel: vscode.OutputChannel;
  private client!: ZlsLanguageClient;
  private disposables: vscode.Disposable[] = [];
  private lspSubscriptions: vscode.Disposable[] = [];

  constructor() {
    this.zlsDiagnostics = vscode.languages.createDiagnosticCollection('zls');
    this.zlsChannel = vscode.window.createOutputChannel("Zig Language Server");
    this.disposables = [
      this.zlsDiagnostics,
      this.zlsChannel,

      // register commands
      vscode.commands.registerCommand("zig.zls.start", async () => {
        await this.startClient();
      }),
      vscode.commands.registerCommand("zig.zls.stop", async () => {
        await this.stopClient();
      }),
      vscode.commands.registerCommand("zig.zls.restart", async () => {
        try { await this.stopClient(); } catch { }
        await this.startClient();
      }),
    ];
  }

  dispose(): void {
    this.stopClient();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }


  async startClient(): Promise<void> {
    this.zlsChannel.appendLine("Starting Zls...");

    const zigCfg = ZigConfig.get(true);
    if (zigCfg.zlsEnableDebugMode && !zigCfg.zlsDebugBinPath) {
      const msg = "Zls Debug mode requested but `zig.zls.zlsDebugBinPath` is not set. Falling back to `zig.zls.binPath`";
      vscode.window.showWarningMessage(msg);
      this.zlsChannel.appendLine(msg);
    }
    const zlsPath = (zigCfg.zlsEnableDebugMode && zigCfg.zlsDebugBinPath) ? zigCfg.zlsDebugBinPath : zigCfg.zlsBinPath;
    const zlsArgs = zigCfg.zlsEnableDebugMode ? ["--debug-log"] : [];
    try {
      await utils.fileExists(zlsPath);
    } catch (err) {
      const zlsBinCfgVar = zigCfg.zlsEnableDebugMode ? "`zig.zls.zlsDebugBinPath`" : "`zig.zls.binPath`";
      const errorMessage =
        `Failed to find zls executable ${zlsPath}!\n`
        + `  Please specify its path in your settings with ${zlsBinCfgVar}\n`
        + `  Error: ${err ?? "Unknown"}`;
      vscode.window.showErrorMessage(errorMessage);
      this.zlsChannel.appendLine(errorMessage);
      this.zlsChannel.show();
      return;
    }

    // Create the language client and start the client
    const serverOptions: vscodelc.ServerOptions = {
      command: zlsPath,
      args: zlsArgs,
    };

    // Options to control the language client
    const clientOptions: vscodelc.LanguageClientOptions = {
      documentSelector: ZigConfig.zigDocumentSelector,
      outputChannel: this.zlsChannel,
      diagnosticCollectionName: this.zlsDiagnostics.name,
      revealOutputChannelOn: vscodelc.RevealOutputChannelOn.Never,

      //#region todo: advanced options
      // clientOptions.initializationOptions = {
      //   clangdFileStatus: true,
      //   fallbackFlags: zigCfg.getWithFallback<string[]>('fallbackFlags', <string[]>[]),
      // };
      // clientOptions.middleware = <vscodelc.Middleware>{
      //   // We hack up the completion items a bit to prevent VSCode from re-ranking and throwing away all our delicious signals like type information
      //   //  VSCode sorts by (fuzzymatch(prefix, item.filterText), item.sortText)
      //   //  By adding the prefix to the beginning of the filterText, we get a perfect fuzzymatch score for every item
      //   //  The sortText (which reflects clangd ranking) breaks the tie.
      //   //  This also prevents VSCode from filtering out any results due to the differences in how fuzzy filtering is applies, e.g. enable dot-to-arrow fixes in completion
      //   //  We also mark the list as incomplete to force retrieving new rankings: https://github.com/microsoft/language-server-protocol/issues/898
      //   provideCompletionItem: async (document, position, context, token, next) => {
      //     let list = await next(document, position, context, token);
      //     if (!zigCfg.getWithFallback('serverCompletionRanking', false)) {
      //       return list;
      //     }
      //     const completionItems = utils.isArray(list) ? list : list!.items;
      //     let items = completionItems.map(item => {
      //       // Gets the prefix used by VSCode when doing fuzzymatch.
      //       let prefix = document.getText(new vscode.Range((item.range as vscode.Range).start, position));
      //       if (prefix) {
      //         item.filterText = prefix + '_' + item.filterText;
      //       }
      //       return item;
      //     });
      //     return new vscode.CompletionList(items, true);
      //   },
      //   // VSCode applies fuzzy match only on the symbol name, thus it throws away all results if query token is a prefix qualified name
      //   //  By adding the containerName to the symbol name, it prevents VSCode from filtering out any results
      //   //    e.g. enable workspaceSymbols for qualified symbols
      //   //  Only make adjustment if query is qualified; otherwise we'd get suboptimal result ordering
      //   //    bc including the name's qualifier (if it has one) in symbol.name means
      //   //    vscode can no longer tell apart exact matches from partial matches
      //   provideWorkspaceSymbols: async (query, token, next) => {
      //     let symbols = await next(query, token);
      //     return symbols?.map(symbol => {
      //       if (query.includes('::')) {
      //         if (symbol.containerName) { symbol.name = `${symbol.containerName}::${symbol.name}`; }
      //         symbol.containerName = ''; // Clean the containerName to avoid displaying it twice.
      //       }
      //       return symbol;
      //     });
      //   },
      // };
      //#endregion
    };


    this.client = new ZlsLanguageClient(
      'zlsClient',
      'Zig Language Server Client',
      serverOptions,
      clientOptions,
    );

    //#region todo: custom language features
    // this.client.clientOptions.errorHandler = this.client.createDefaultErrorHandler(zigCfg.getWithFallback('maxRestartCount', 0));
    // this.client.registerFeature(new EnableEditsNearCursorFeature);
    // typeHierarchy.activate(this);
    // inlayHints.activate(this);
    // memoryUsage.activate(this);
    // ast.activate(this);
    // openConfig.activate(this);
    // fileStatus.activate(this);
    // switchSourceHeader.activate(this);
    // configFileWatcher.activate(this);
    //#endregion

    this.lspSubscriptions.push(this.client.start());
    await this.client.onReady();
  }

  private async stopClient() {
    this.zlsChannel.appendLine("Stopping Zls...");
    const oldLspSubscriptions = this.lspSubscriptions.slice(0);
    this.lspSubscriptions = [];
    oldLspSubscriptions.forEach(d => d.dispose());

    // const oldServers = this.activeServers.slice(0);
    // this.activeServers = [];
    // try {
    //   const result = await Promise.allSettled(oldServers);
    //   for (const item of result) {
    //     if (item.status === 'fulfilled') {
    //       item.value.dispose();
    //     }
    //   }
    // }
    // catch { }

  }

}
