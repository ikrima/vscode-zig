import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions} from 'vscode-languageclient/node';

export namespace ZigLanguageClient {
  let client: LanguageClient;

  export function activate() {
    const config = vscode.workspace.getConfiguration('zig');
    const zlsPath = config.get<string>('zls.path') || '';
    const debugLog = config.get<boolean>('zls.debugLog') || false;

    if (!zlsPath) {
      vscode.window.showErrorMessage("Failed to find zls executable! Please specify its path in your settings with `zig.path`.");
      return;
    }

    let serverOptions: ServerOptions = {
      command: zlsPath,
      args: debugLog ? [ "--debug-log" ] : []
    };

    // Options to control the language client
    let clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file', language: 'zig' }],
      outputChannel: vscode.window.createOutputChannel("Zig Language Server")
    };

    // Create the language client and start the client.
    client = new LanguageClient(
      'zigLanguageClient',
      'Zig Language Server Client',
      serverOptions,
      clientOptions
    );

    client.start();

    vscode.commands.registerCommand("zig.zls.start", () => {
      client.start();
    });

    vscode.commands.registerCommand("zig.zls.stop", async () => {
      await client.stop();
    });

    vscode.commands.registerCommand("zig.zls.restart", async () => {
      await client.stop();
      client.start();
    });
  }

  export function deactivate(): Thenable<void> | undefined {
    if (!client) {
      return undefined;
    }
    return client.stop();
  }
}