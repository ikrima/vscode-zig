'use strict';

import * as vscode from 'vscode';
const { fs } = vscode.workspace;
import { LanguageClient, LanguageClientOptions, ServerOptions, RevealOutputChannelOn } from 'vscode-languageclient/node';
import { ZigExtSettings } from "./zigSettings";

export class ZlsClient {
  private zlsDiagnostics: vscode.DiagnosticCollection;
  private zlsChannel: vscode.OutputChannel;
  private activeServers: Promise<vscode.Disposable>[] = [];
  private disposables: vscode.Disposable[];

  constructor() {
    this.zlsDiagnostics = vscode.languages.createDiagnosticCollection('zls');
    this.zlsChannel = vscode.window.createOutputChannel("Zig Language Server");
    this.disposables = [
      this.zlsDiagnostics,
      this.zlsChannel,

      // register commands
      vscode.commands.registerCommand("zig.zls.start", () => {
        this.startServer();
      }),
      vscode.commands.registerCommand("zig.zls.stop", async () => {
        try { await this.stopServers(); } catch { }
      }),
      vscode.commands.registerCommand("zig.zls.restart", async () => {
        try { await this.stopServers(); } catch { }
        this.startServer();
      }),
    ];

    this.startServer();
  }

  dispose(): void {
    this.stopServers();
    this.disposables.map(disposable => disposable.dispose());
  }


  private startServer() {
    async function _startServer(
      zlsDiagnostics: vscode.DiagnosticCollection,
      zlsChannel: vscode.OutputChannel,
    ): Promise<vscode.Disposable> {
      const extSettings = ZigExtSettings.getSettings(true);

      try {
        await fs.stat(vscode.Uri.file(extSettings.zlsBinPath));
      } catch (err) {
        const errorMessage = `Failed to find zls executable ${extSettings.zlsBinPath}!`;
        vscode.window.showErrorMessage(errorMessage);
        zlsChannel.appendLine(errorMessage);
        zlsChannel.appendLine("Please specify its path in your settings with `zig.zls.binPath`.");
        if (err) { zlsChannel.appendLine(`  Error: ${err}`); }
        zlsChannel.show();
        return new vscode.Disposable(() => { });
      }
      // Create the language client and start the client.
      const serverOptions: ServerOptions = {
        command: extSettings.zlsBinPath,
        args: extSettings.zlsDebugLog ? ["--debug-log"] : [],
      };

      // Options to control the language client
      const clientOptions: LanguageClientOptions = {
        documentSelector: [{ language: ZigExtSettings.languageId, scheme: 'file' }],
        outputChannel: zlsChannel,
        diagnosticCollectionName: zlsDiagnostics.name,
        revealOutputChannelOn: RevealOutputChannelOn.Never,
      };

      const client = new LanguageClient(
        'zlsClient',
        'Zig Language Server Client',
        serverOptions,
        clientOptions
      );

      const disposable = client.start();
      await client.onReady();
      return disposable;
    }

    this.zlsChannel.appendLine("Starting Zls...");
    this.activeServers.push(_startServer(this.zlsDiagnostics, this.zlsChannel));
  }

  private async stopServers() {
    this.zlsChannel.appendLine("Stopping Zls...");
    const oldServers = this.activeServers.slice(0);
    this.activeServers = [];
    try {
      const result = await Promise.allSettled(oldServers);
      for (const item of result) {
        if (item.status === 'fulfilled') {
          item.value.dispose();
        }
      }
    }
    catch { }
  }
}
