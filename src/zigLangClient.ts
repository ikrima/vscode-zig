import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, RevealOutputChannelOn } from 'vscode-languageclient/node';

export function activate(context: vscode.ExtensionContext) {
  let activeServers: Promise<vscode.Disposable>[] = [];
  startServer();

  function startServer() {
    activeServers.push(
      _startServer()
    );
  }
  async function stopServers() {
    const oldServers = activeServers.slice(0);
    activeServers = [];
    const result = await Promise.allSettled(oldServers);
    for (const item of result) {
      if (item.status === 'fulfilled') {
        item.value.dispose();
      }
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("zig.zls.start", () => {
      startServer();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("zig.zls.stop", async () => {
      await stopServers();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("zig.zls.restart", async () => {
      await stopServers();
      startServer();
    })
  );

  // stop server on deactivate
  context.subscriptions.push(new vscode.Disposable(stopServers));
}


async function _startServer(): Promise<vscode.Disposable> {
  const config = vscode.workspace.getConfiguration('zig');
  const zlsPath = config.get<string>('zls.path');
  const debugLog = config.get<boolean>('zls.debugLog', false);

  if (!zlsPath) {
    vscode.window.showErrorMessage("Failed to find zls executable! Please specify its path in your settings with `zig.path`.");
    return;
  }

  const disposables: vscode.Disposable[] = [];

  // Create the language client and start the client.
  const serverOptions: ServerOptions = {
    command: zlsPath,
    args: debugLog ? ["--debug-log"] : []
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'zig' }],
    outputChannelName: "Zig Language Server",
    revealOutputChannelOn: RevealOutputChannelOn.Never,
  };

  const client = new LanguageClient(
    'zigLanguageClient',
    'Zig Language Server Client',
    serverOptions,
    clientOptions
  );

  disposables.push(client.start());
  await client.onReady();
  return new vscode.Disposable(() => disposables.forEach(d => d.dispose()));
}
