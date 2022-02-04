import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, RevealOutputChannelOn } from 'vscode-languageclient/node';

export function activate(context: vscode.ExtensionContext) {
  const zlsChannel = vscode.window.createOutputChannel("Zig Language Server");
  let activeServers: Promise<vscode.Disposable>[] = [];
  startServer();

  function startServer() {
    zlsChannel.appendLine("Starting Zls...");
    activeServers.push(_startServer(zlsChannel));
  }
  async function stopServers() {
    zlsChannel.appendLine("Stopping Zls...");
    const oldServers = activeServers.slice(0);
    activeServers = [];
    const result = await Promise.allSettled(oldServers);
    for (const item of result) {
      if (item.status === 'fulfilled') {
        item.value.dispose();
      }
    }
  }

  // register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("zig.zls.start", () => startServer()),
    vscode.commands.registerCommand("zig.zls.stop", async () => await stopServers()),
    vscode.commands.registerCommand("zig.zls.restart", async () => {
      await stopServers();
      startServer();
    }),
  );

  // stop server on deactivate
  vscode.Disposable.from(
    new vscode.Disposable(stopServers),
    zlsChannel,
  );
}


async function _startServer(zlsChannel: vscode.OutputChannel): Promise<vscode.Disposable> {
  const config = vscode.workspace.getConfiguration('zig');
  const zlsPath = config.get<string>('zls.path');
  const zlsDebugLog = config.get<boolean>('zls.debugLog', false);

  if (!zlsPath) {
    vscode.window.showErrorMessage("Failed to find zls executable! Please specify its path in your settings with `zig.path`.");
    return new vscode.Disposable(() => { });
  }


  // Create the language client and start the client.
  const disposables: vscode.Disposable[] = [];
  const serverOptions: ServerOptions = {
    command: zlsPath,
    args: zlsDebugLog ? ["--debug-log"] : [],
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'zig' }],
    outputChannel: zlsChannel,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
  };

  const client = new LanguageClient(
    'zlsClient',
    'Zig Language Server Client',
    serverOptions,
    clientOptions
  );

  disposables.push(client.start());
  await client.onReady();
  return new vscode.Disposable(() => disposables.forEach(d => d.dispose()));
}
