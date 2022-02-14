import * as vscode from 'vscode';
const { fs } = vscode.workspace;
import { LanguageClient, LanguageClientOptions, ServerOptions, RevealOutputChannelOn } from 'vscode-languageclient/node';
import { getExtensionSettings } from "./zigSettings";

export function activate(): vscode.Disposable {
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

  return vscode.Disposable.from(
    // register commands
    vscode.commands.registerCommand("zig.zls.start", () => startServer()),
    vscode.commands.registerCommand("zig.zls.stop", async () => await stopServers()),
    vscode.commands.registerCommand("zig.zls.restart", async () => {
      await stopServers();
      startServer();
    }),

    // stop server on deactivate
    new vscode.Disposable(stopServers),
    zlsChannel,
  );
}


async function _startServer(zlsChannel: vscode.OutputChannel): Promise<vscode.Disposable> {
  const settings = getExtensionSettings();

  try {
    await fs.stat(vscode.Uri.file(settings.zls.binPath));
  } catch (err) {
    const errorMessage = `Failed to find zls executable ${settings.zls.binPath}!`;
    vscode.window.showErrorMessage(errorMessage);
    zlsChannel.appendLine(errorMessage);
    zlsChannel.appendLine("Please specify its path in your settings with 'zig.zls.binPath'.");
    if (err) { zlsChannel.appendLine(`  Error: ${err}`); }
    zlsChannel.show();
    return new vscode.Disposable(() => { });
  }
  // Create the language client and start the client.
  const serverOptions: ServerOptions = {
    command: settings.zls.binPath,
    args: settings.zls.debugLog ? ["--debug-log"] : [],
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

  const disposable = client.start();
  await client.onReady();
  return disposable;
}
