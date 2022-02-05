import * as vscode from "vscode";
import * as path from 'path';
import * as fs from 'fs';
import YAML from 'js-yaml';
import { getExtensionSettings } from "./zigSettings";

interface ZigTaskDefinition extends vscode.TaskDefinition {
  testDebug: boolean;
  testFilePath: string;
  testArgs?: string[];
  testFilter?: string;
  testMainPkgPath?: string;
  testEmitBin?: string;
};

export class ZigTaskProvider implements vscode.TaskProvider {
  private lastRanTask?: ZigTaskDefinition;
  private _channel: vscode.OutputChannel;

  constructor(context: vscode.ExtensionContext, logChannel: vscode.OutputChannel) {
    this._channel = logChannel;

    context.subscriptions.push(
      vscode.commands.registerCommand("zig.test.run", (filename: vscode.Uri, filter: string) => {
        const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0] : null;
        if (!workspaceFolder) { return; }
        const testTask = this.doResolveTask(workspaceFolder, {
          type: 'zig',
          testDebug: false,
          testFilePath: filename.fsPath,
          testFilter: filter,
        });
        this.lastRanTask = <ZigTaskDefinition>testTask.definition;
        vscode.tasks.executeTask(testTask);
        vscode.commands.executeCommand(
          "setContext",
          "zig.hasLastRanTask",
          true
        );
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("zig.test.debug", async (filename: vscode.Uri, filter: string) => {
        const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0] : null;
        if (!workspaceFolder) { return; }

        const cppToolsExtension = vscode.extensions.getExtension("ms-vscode.cpptools");
        const cppToolsExtActive = cppToolsExtension && cppToolsExtension.isActive;
        const codeLLDBExtension = vscode.extensions.getExtension("vadimcn.vscode-lldb");
        const codeLLDBExtActive = codeLLDBExtension && codeLLDBExtension.isActive;
        if (!cppToolsExtActive && !codeLLDBExtActive) {
          this._channel.appendLine("cpptools/vscode-lldb extension must be enabled or installed.");
          this._channel.show();
          return;
        }

        const settings = getExtensionSettings();
        const testTask = this.doResolveTask(workspaceFolder, {
          type: 'zig',
          testDebug: true,
          testFilePath: filename.fsPath,
          testFilter: filter,
        });
        this.lastRanTask = <ZigTaskDefinition>testTask.definition;
        const execution = await vscode.tasks.executeTask(testTask);

        let handler: vscode.Disposable | null = vscode.tasks.onDidEndTask((e) => {
          if (!handler || e.execution !== execution) { return; }
          handler.dispose();
          handler = null;
          const taskDef = <ZigTaskDefinition>testTask.definition;
          const testEmitBin = taskDef.testEmitBin ?? "";
          const testArgs = taskDef.testArgs ?? [];
          if (!fs.existsSync(testEmitBin)) {
            return;
          }

          if (cppToolsExtActive) {
            return vscode.debug.startDebugging(
              workspaceFolder,
              {
                type: 'cppvsdbg',
                name: `Zig Test Debug`,
                request: 'launch',
                program: testEmitBin,
                args: [settings.zigPath, ...testArgs],
                cwd: workspaceFolder,
                console: 'integratedTerminal',
              },
            ).then((_) => { });
          } else {
            const launch = Object.assign(
              {},
              {
                type: "lldb",
                request: "launch",
                name: "Zig Test Debug",
                program: testEmitBin,
                args: [settings.zigPath, ...testArgs],
                cwd: workspaceFolder,
                internalConsoleOptions: "openOnSessionStart",
                terminal: "console",
              }
            );

            let yaml = YAML.dump(launch, {
              condenseFlow: true,
              forceQuotes: true,
            });
            if (yaml.endsWith(",")) {
              yaml = yaml.substring(0, yaml.length - 1);
            }

            return vscode.env
              .openExternal(vscode.Uri.parse(`${vscode.env.uriScheme}://vadimcn.vscode-lldb/launch/config?${yaml}`))
              .then((_) => { });
          }
        });
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("zig.test.rerun", (_) => {
        if (this.lastRanTask) {
          const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0] : null;
          if (!workspaceFolder) { return; }
          vscode.tasks.executeTask(this.doResolveTask(workspaceFolder, this.lastRanTask));
        }
      }),
    );

  }

  public async provideTasks(): Promise<vscode.Task[]> {
    const result: vscode.Task[] = [
      // new vscode.Task(
      //   { type: "zig", task: "test" },
      //   vscode.workspace.workspaceFolders[0],
      //   "test",
      //   "zig",
      //   new vscode.ShellExecution("zig test")
      // ),
      // new vscode.Task(
      //   { type: "zig", task: "debug" },
      //   vscode.workspace.workspaceFolders[0],
      //   "debug",
      //   "zig",
      //   new vscode.ShellExecution("zig test")
      // ),
    ];
    return result;

  }

  public resolveTask(_task: vscode.Task): vscode.Task | undefined {
    const workspaceFolder: vscode.WorkspaceFolder | null = _task.scope
      ? _task.scope as vscode.WorkspaceFolder
      : (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
        ? vscode.workspace.workspaceFolders[0]
        : null
      );
    if (!workspaceFolder) { return undefined; }

    const definition: ZigTaskDefinition = <any>_task.definition;
    return this.doResolveTask(workspaceFolder, definition, _task.presentationOptions);
  }


  private doResolveTask(
    workspaceFolder: vscode.WorkspaceFolder,
    _def: ZigTaskDefinition,
    presentationOptions?: vscode.TaskPresentationOptions,
  ): vscode.Task {
    const workspacePath = workspaceFolder.uri.fsPath;
    const settings = getExtensionSettings();

    let def: ZigTaskDefinition = {
      type: 'zig',
      testDebug: _def.testDebug,
      testFilePath: _def.testFilePath,
      testArgs: _def.testArgs ?? (_def.testDebug ? settings.testDbgArgs : settings.testArgs),
      testFilter: _def.testFilter ?? "",
      testMainPkgPath: _def.testMainPkgPath ?? settings.buildRootDir,
      testEmitBin: path.join(settings.testBinDir, _def.testEmitBin ?? `test-${workspaceFolder.name}.exe`),
    };


    def.testArgs = def.testArgs?.map(a => {
      return a
        .replace("${workspaceFolder}", workspacePath)
        .replace("${filename}", def.testFilePath ?? "")
        .replace("${filter}", def.testFilter ?? "")
        .replace("${bin}", def.testEmitBin ?? "");
    });
    const finalTestArgs: string[] = (<string[]>[]).concat(
      [
        "test",
      ],
      def.testMainPkgPath ? ["--main-pkg-path", `${def.testMainPkgPath}`] : [],
      [
        `-femit-bin=${def.testEmitBin}`,
        path.relative(settings.buildRootDir, def.testFilePath),
      ],
      def.testFilter ? ["--test-filter", `${def.testFilter}`,] : [],
      def.testArgs ?? [],
      def.testDebug ? [`--test-no-exec`] : [],
    );
    const shellExec = new vscode.ShellExecution(
      settings.zigPath,
      finalTestArgs,
      {
        cwd: settings.buildRootDir,
      });
    this._channel.appendLine(`Test command: ${finalTestArgs}`);


    // if (testEmitBin) {
    //   try { fs.rmSync(testEmitBin); } catch (exception) { }
    // }
    const taskName = `test ${path.basename(def.testFilePath, ".zig")}`;
    let task = new vscode.Task(
      def,
      workspaceFolder,
      taskName,
      'zig',
      shellExec,
      settings.enableProblemMatcherForTest ? ["zig"] : [],
    );
    task.detail = taskName;
    task.presentationOptions = presentationOptions ?? <vscode.TaskPresentationOptions>{};
    task.presentationOptions.clear = true;
    task.presentationOptions.showReuseMessage = false;
    task.presentationOptions.echo = true;
    task.presentationOptions.reveal = task.presentationOptions.reveal ?? (def.testDebug
      ? vscode.TaskRevealKind.Silent
      : vscode.TaskRevealKind.Always);
    return task;
  }


}
