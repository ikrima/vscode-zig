import * as vscode from "vscode";
const { fs } = vscode.workspace;
import * as path from 'path';
import YAML from 'js-yaml';
import { resolveVsCodeVars, IZigSettings, getExtensionSettings } from "./zigSettings";

interface ZigTaskDefinition extends vscode.TaskDefinition {
  isDebugTask:  boolean;
  srcFilePath:  string;
  testArgs?:    string[];
  debugArgs?:   string[];
  testFilter?:  string;
  mainPkgPath?: string;
  emitBinPath?: string;
};


export class ZigTaskProvider implements vscode.TaskProvider {
  private lastRanZigTask?: vscode.Task = undefined;

  constructor(
    context: vscode.ExtensionContext,
    private logChannel: vscode.OutputChannel,
  ) {
    context.subscriptions.push(
      vscode.commands.registerCommand("zig.test.run", async (filename: vscode.Uri, filter: string) => {
        const testTaskDef: ZigTaskDefinition = {
          type:        'zig',
          isDebugTask: false,
          srcFilePath: filename.fsPath,
          testFilter:  filter,
        };
        await this._runTask(true, testTaskDef);
      })
    );
    context.subscriptions.push(
      vscode.commands.registerCommand("zig.test.debug", async (filename: vscode.Uri, filter: string) => {
        const testTaskDef: ZigTaskDefinition = {
          type:        'zig',
          isDebugTask: true,
          srcFilePath: filename.fsPath,
          testFilter:  filter,
        };
        await this._runTask(true, testTaskDef);
      }),
    );
    context.subscriptions.push(
      vscode.commands.registerCommand("zig.test.rerun", async (_) => {
        if (this.lastRanZigTask) {
          await this._runTask(false, <ZigTaskDefinition>this.lastRanZigTask.definition);
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
    const workspaceFolder: vscode.WorkspaceFolder | undefined = _task.scope
      ? _task.scope as vscode.WorkspaceFolder
      : (vscode.workspace.workspaceFolders?.[0] ?? undefined);
    if (!workspaceFolder) { return undefined; }

    const definition: ZigTaskDefinition = <any>_task.definition;
    const settings = getExtensionSettings();
    return this._doResolveTask(
      settings,
      workspaceFolder,
      definition,
      _task.presentationOptions,
    );
  }

  private async _runTask(isNewTaskRun: boolean, _def?: ZigTaskDefinition): Promise<boolean> {
    const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0] : undefined;
    if (!workspaceFolder) { return false; }
    const settings = getExtensionSettings();

    try {
      const testTask = isNewTaskRun
        ? this._doResolveTask(
          settings,
          workspaceFolder,
          _def!)
        : this.lastRanZigTask!;
      const testTaskDef = <ZigTaskDefinition>testTask.definition;
      const isDebugTask = testTaskDef.isDebugTask;
      const testEmitBinUri = vscode.Uri.file(testTaskDef.emitBinPath!);
      const testEmitDirUri = vscode.Uri.file(path.parse(testEmitBinUri.fsPath).dir);

      if (isNewTaskRun) {
        this.lastRanZigTask = testTask;
        vscode.commands.executeCommand("setContext", "zig.hasLastRanTask", true);
      }


      if (!(await fs.stat(testEmitDirUri).then(_ => true, _ => false))) {
        try {
          await fs.createDirectory(testEmitDirUri);
        } catch (err) {
          this.logChannel.appendLine(`Could not create testEmitBinDir: (${testEmitDirUri}) does not exists. Error: ${err ?? "Unknown"}`);
          this.logChannel.show();
          return false;
        }
      }
      // if (testEmitBinUri) {
      //   try { fs.rmSync(testEmitBinUri); } catch (exception) { }
      // }

      const execution = await vscode.tasks.executeTask(testTask);
      await new Promise<void>(resolve => {
        let disposable: vscode.Disposable | undefined = vscode.tasks.onDidEndTask((e) => {
          if (!disposable || e.execution !== execution) { return; }
          disposable.dispose();
          resolve();
          disposable = undefined;
        });
      });

      if (isDebugTask) {
        const cppToolsExtActive = vscode.extensions.getExtension("ms-vscode.cpptools")?.isActive ?? false;
        const codeLLDBExtActive = vscode.extensions.getExtension("vadimcn.vscode-lldb")?.isActive ?? false;
        if (!cppToolsExtActive && !codeLLDBExtActive) {
          this.logChannel.appendLine("cpptools/vscode-lldb extension must be enabled or installed.");
          this.logChannel.show();
          return false;
        }


        try { await fs.stat(testEmitBinUri); } catch (err) {
          this.logChannel.appendLine(`Failed to compiled test binary: (${testEmitBinUri.fsPath})`);
          if (err) { this.logChannel.appendLine(`  FileSystemError: ${err}`); }
          this.logChannel.show();
          return false;
        }

        if (cppToolsExtActive) {
          return vscode.debug.startDebugging(
            workspaceFolder,
            {
              type:    'cppvsdbg',
              name:    `Zig Test Debug`,
              request: 'launch',
              program: testEmitBinUri.fsPath,
              args:    [settings.binPath, ...testTaskDef.debugArgs!],
              cwd:     workspaceFolder,
              console: 'integratedTerminal',
            },
          );
        } else {
          const launch = Object.assign(
            {},
            {
              type:                   "lldb",
              request:                "launch",
              name:                   "Zig Test Debug",
              program:                testEmitBinUri.fsPath,
              args:                   [settings.binPath, ...testTaskDef.debugArgs!],
              cwd:                    workspaceFolder,
              internalConsoleOptions: "openOnSessionStart",
              terminal:               "console",
            }
          );
          let yaml = YAML.dump(launch, { condenseFlow: true, forceQuotes: true });
          if (yaml.endsWith(",")) { yaml = yaml.substring(0, yaml.length - 1); }
          return vscode.env
            .openExternal(vscode.Uri.parse(`${vscode.env.uriScheme}://vadimcn.vscode-lldb/launch/config?${yaml}`))
            .then((_) => { return true; });
        }
      }
      else {
        return true;
      }
    }
    catch (err) {
      return false;
    }
  }

  private _doResolveTask(
    settings: IZigSettings,
    workspaceFolder: vscode.WorkspaceFolder,
    _def: ZigTaskDefinition,
    _presentationOptions?: vscode.TaskPresentationOptions,
  ): vscode.Task {
    const isDebugTask    = _def.isDebugTask;
    const testSrcAbsPath = path.normalize(_def.srcFilePath);
    const testFilter     = _def.testFilter ?? "";
    const mainPkgPath    = _def.mainPkgPath ?? settings.build.rootDir;
    const emitBinPath    = _def.emitBinPath ?? path.join(settings.task.binDir, `test-${workspaceFolder.name}.exe`);
    const testBinName    = path.basename(emitBinPath, ".exe");
    const testArgs       = _def.testArgs?.map(configVal => resolveVsCodeVars(configVal, false)) ?? settings.task.testArgs;
    const debugArgs      = _def.debugArgs?.map(configVal => resolveVsCodeVars(configVal, false)) ?? settings.task.debugArgs;

    const shellArgs: string[] = ["test"]
      .concat(
        [testSrcAbsPath],
        mainPkgPath ? ["--main-pkg-path", `${mainPkgPath}`] : [],
        [`-femit-bin=${emitBinPath}`],
        testFilter ? ["--test-filter", `${testFilter}`,] : [],
        testArgs,
        isDebugTask ? [`--test-no-exec`] : [],
        [
          "--name",
          testBinName,
          "--enable-cache",
        ]
      );
    const shellExec = new vscode.ShellExecution(
      settings.binPath,
      shellArgs,
      { cwd: settings.build.rootDir }
    );
    this.logChannel.appendLine("Test ZigArgs:");
    shellExec.args.forEach(a => this.logChannel.appendLine(`  ${a}`));

    let presentationOptions = _presentationOptions ?? <vscode.TaskPresentationOptions>{};
    presentationOptions.clear = true;
    presentationOptions.showReuseMessage = false;
    presentationOptions.echo = true;
    presentationOptions.reveal = presentationOptions.reveal ?? (isDebugTask
      ? vscode.TaskRevealKind.Silent
      : vscode.TaskRevealKind.Always);

    let task = new vscode.Task(
      <ZigTaskDefinition>{
        type:        'zig',
        isDebugTask: isDebugTask,
        srcFilePath: testSrcAbsPath,
        testArgs:    testArgs,
        debugArgs:   debugArgs,
        testFilter:  testFilter,
        mainPkgPath: mainPkgPath,
        emitBinPath: emitBinPath,
      },
      workspaceFolder,
      testBinName,
      'zig',
      shellExec,
      settings.task.enableProblemMatcher ? ["zig"] : [],
    );
    task.detail = testBinName;
    task.presentationOptions = presentationOptions;
    return task;
  }


}
