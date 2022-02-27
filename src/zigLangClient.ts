'use strict';

import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient/node';
import * as utils from './utils';
import { ZigConfig } from "./zigConfig";

const zigDocumentSelector = [
  { language: ZigConfig.languageId, scheme: 'file' }
];

export class ZlsClient implements vscode.Disposable {
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
        await this.stopServers();
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
    this.disposables.forEach(d => d.dispose());
  }


  private startServer() {
    async function _startServer(
      zlsDiagnostics: vscode.DiagnosticCollection,
      zlsChannel: vscode.OutputChannel,
    ): Promise<vscode.Disposable> {
      const zigCfg = ZigConfig.get(true);

      try {
        await utils.fileExists(zigCfg.zlsBinPath);
      } catch (err) {
        const errorMessage =
          `Failed to find zls executable ${zigCfg.zlsBinPath}!\n`
          + `  Please specify its path in your settings with \`zig.zls.binPath\`.\n`
          + `  Error: ${err ?? "Unknown"}`;
        vscode.window.showErrorMessage(errorMessage);
        zlsChannel.appendLine(errorMessage);
        zlsChannel.show();
        return new vscode.Disposable(() => { });
      }
      // Create the language client and start the client.
      const serverOptions: vscodelc.ServerOptions = {
        command: zigCfg.zlsBinPath,
        args: zigCfg.zlsDebugLog ? ["--debug-log"] : [],
      };

      // Options to control the language client
      const clientOptions: vscodelc.LanguageClientOptions = {
        documentSelector: zigDocumentSelector,
        outputChannel: zlsChannel,
        diagnosticCollectionName: zlsDiagnostics.name,
        revealOutputChannelOn: vscodelc.RevealOutputChannelOn.Never,
      };

      const client = new vscodelc.LanguageClient(
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
