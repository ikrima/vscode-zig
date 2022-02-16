'use strict';
import * as vscode from "vscode";
import * as cp from 'child_process';
const { fs } = vscode.workspace;
import * as path from 'path';
import YAML from 'js-yaml';
import { ZigExtSettings, resolveVariables, isWindows } from "./zigSettings";


interface ZigTaskDefinition extends vscode.TaskDefinition {
  type:         string;
  isDebugTask:  boolean;
  srcFilePath:  string;
  testArgs?:    string[];
  testFilter?:  string;
  mainPkgPath?: string;
  emitBinPath?: string;
};
export class ZigTask extends vscode.Task {
  constructor(
    public zigBinPath:  string,
    public emitBinPath: string,
    public isDebugTask:  boolean,
    public debugArgs:   string[],
    taskDef: ZigTaskDefinition,
    scope: vscode.WorkspaceFolder | vscode.TaskScope.Global | vscode.TaskScope.Workspace,
    name: string,
    taskExec: vscode.ProcessExecution | vscode.ShellExecution | vscode.CustomExecution,
    problemMatchers: string | string[] | undefined,
    group: vscode.TaskGroup,
    detail: string,
    presentationOptions: vscode.TaskPresentationOptions,
  ) {
    super(
      taskDef,
      scope,
      name,
      ZigTaskProvider.ProviderSrcStr,
      taskExec,
      problemMatchers,
    );
    this.group = group;
    this.detail = detail;
    this.presentationOptions = presentationOptions;

 }
}

function cppToolsExtActive(): boolean { return vscode.extensions.getExtension("ms-vscode.cpptools")?.isActive ?? false; }
function codeLLDBExtActive(): boolean { return vscode.extensions.getExtension("vadimcn.vscode-lldb")?.isActive ?? false; }

export class ZigTaskProvider implements vscode.TaskProvider {
  private lastRanZigTask?: ZigTask = undefined;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  static readonly ProviderSrcStr: string = 'zig';
  // eslint-disable-next-line @typescript-eslint/naming-convention
  static readonly TaskType:   string = 'zig';
  // eslint-disable-next-line @typescript-eslint/naming-convention
  static readonly ProblemMatcher: string = '$zig';

  constructor(
    context: vscode.ExtensionContext,
    private logChannel: vscode.OutputChannel,
  ) {
    context.subscriptions.push(
      vscode.commands.registerCommand("zig.test.run", async (filename: vscode.Uri, filter: string) => {
        const zigTask = this.getTask({
          type:        ZigTaskProvider.TaskType,
          isDebugTask: false,
          srcFilePath: filename.fsPath,
          testFilter:  filter,
        });
        await this._runTask(zigTask, true);
      })
    );
    context.subscriptions.push(
      vscode.commands.registerCommand("zig.test.debug", async (filename: vscode.Uri, filter: string) => {
        const zigTask = this.getTask({
          type:        ZigTaskProvider.TaskType,
          isDebugTask: true,
          srcFilePath: filename.fsPath,
          testFilter:  filter,
        });
        await this._runTask(zigTask, true);
      }),
    );
    context.subscriptions.push(
      vscode.commands.registerCommand("zig.test.rerun", async (_) => {
        if (this.lastRanZigTask) {
          await this._runTask(this.lastRanZigTask, false);
        }
      }),
    );

  }

  public async provideTasks(): Promise<ZigTask[]> {
    const result: ZigTask[] = [
      // new vscode.Task(
      //   { type: ZigTaskProvider.TaskType, task: "test" },
      //   vscode.workspace.workspaceFolders[0],
      //   "test",
      //   ZigTaskProvider.ProviderSrcStr,
      //   new vscode.ShellExecution("zig test")
      // ),
      // new vscode.Task(
      //   { type: ZigTaskProvider.TaskType, task: "debug" },
      //   vscode.workspace.workspaceFolders[0],
      //   "debug",
      //   ZigTaskProvider.ProviderSrcStr,
      //   new vscode.ShellExecution("zig test")
      // ),
    ];
    return result;

  }

  public resolveTask(_task: ZigTask): ZigTask | undefined {
    const execution: vscode.ProcessExecution | vscode.ShellExecution | vscode.CustomExecution | undefined = _task.execution;
    if (!execution) {
        const taskDef: ZigTaskDefinition = <any>_task.definition;
        _task = this.getTask(
          taskDef,
          _task.scope as vscode.WorkspaceFolder,
          _task.presentationOptions,
        );
        return _task;
    }
    return undefined;
  }

  private async _runTask(zigTask: ZigTask, updateLastRun: boolean): Promise<boolean> {
    try {

      if (updateLastRun) {
        this.lastRanZigTask = zigTask;
        vscode.commands.executeCommand("setContext", "zig.hasLastRanTask", true);
      }

      const testEmitBinDir = path.parse(zigTask.emitBinPath).dir;
      if (!(await fs.stat(vscode.Uri.file(testEmitBinDir)).then(_ => true, _ => false))) {
        try {
          await fs.createDirectory(vscode.Uri.file(testEmitBinDir));
        } catch (err) {
          this.logChannel.appendLine(`Could not create testEmitBinDir: (${zigTask.emitBinPath}) does not exists. Error: ${err ?? "Unknown"}`);
          this.logChannel.show();
          return false;
        }
      }

      const execution = await vscode.tasks.executeTask(zigTask);
      await new Promise<void>(resolve => {
        let disposable: vscode.Disposable | undefined = vscode.tasks.onDidEndTask((e) => {
          if (!disposable || e.execution !== execution) { return; }
          disposable.dispose();
          resolve();
          disposable = undefined;
        });
      });

      if (zigTask.isDebugTask) {
        if (!cppToolsExtActive() && !codeLLDBExtActive()) {
          this.logChannel.appendLine("cpptools/vscode-lldb extension must be enabled or installed.");
          this.logChannel.show();
          return false;
        }


        try { await fs.stat(vscode.Uri.file(zigTask.emitBinPath)); } catch (err) {
          this.logChannel.appendLine(`Failed to compiled test binary: (${zigTask.emitBinPath})`);
          if (err) { this.logChannel.appendLine(`  FileSystemError: ${err}`); }
          this.logChannel.show();
          return false;
        }
        const folder: vscode.WorkspaceFolder | undefined = zigTask.scope as vscode.WorkspaceFolder;
        if (cppToolsExtActive()) {
          return vscode.debug.startDebugging(
            folder,
            {
              type:    'cppvsdbg',
              name:    `Zig Test Debug`,
              request: 'launch',
              program: zigTask.emitBinPath,
              args:    [zigTask.zigBinPath, ...zigTask.debugArgs],
              cwd:     folder,
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
              program:                zigTask.emitBinPath,
              args:                   [zigTask.zigBinPath, ...zigTask.debugArgs],
              cwd:                    folder,
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

  private getTask(
    _def:                  ZigTaskDefinition,
    _folder?:              vscode.WorkspaceFolder,
    _presentationOptions?: vscode.TaskPresentationOptions,
  ): ZigTask {
    const extSettings = ZigExtSettings.getSettings();
    const folder: vscode.WorkspaceFolder | undefined = _folder
      ?? (vscode.window.activeTextEditor
          ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
          : vscode.workspace.workspaceFolders?.[0]);

    const presentationOptions = _presentationOptions ?? <vscode.TaskPresentationOptions>{};
    presentationOptions.echo             = true;
    presentationOptions.showReuseMessage = false;
    presentationOptions.clear            = true;
    presentationOptions.reveal           = _presentationOptions?.reveal ?? (_def.isDebugTask
      ? vscode.TaskRevealKind.Silent
      : vscode.TaskRevealKind.Always);

    const debugArgs      = _def.debugArgs ?? extSettings.taskDebugArgs;
    const emitBinPath    = _def.emitBinPath ?? path.join(extSettings.taskBinDir, folder ? `test-${folder.name}.exe` : "test-zig.exe");
    const testName       = path.parse(emitBinPath).name;
    const testDetail     = `zig build task: ${testName}`;
    return new ZigTask(
      extSettings.zigBinPath,
      emitBinPath,
      _def.isDebugTask,
      debugArgs.map((configVal: string) => resolveVariables(configVal)) ?? [],
      <ZigTaskDefinition>{
        type:        ZigTaskProvider.TaskType,
        isDebugTask: _def.isDebugTask,
        srcFilePath: path.normalize(_def.srcFilePath),
        testArgs:    _def.testArgs ?? extSettings.taskTestArgs,
        debugArgs:   debugArgs,
        testFilter:  _def.testFilter,
        mainPkgPath: _def.mainPkgPath ?? extSettings.buildRootDir,
        emitBinPath: emitBinPath,
        options:     { cwd: extSettings.buildRootDir },
      },
      folder ? folder : vscode.TaskScope.Workspace,
      testName,
      new vscode.CustomExecution(async (resolvedTaskDef: vscode.TaskDefinition): Promise<vscode.Pseudoterminal> => {
        return new ZigBuildTaskTerminal(
          extSettings,
          testName,
          <ZigTaskDefinition>resolvedTaskDef,
        );
      }),
      extSettings.taskEnableProblemMatcher ? ZigTaskProvider.ProblemMatcher : undefined,
      vscode.TaskGroup.Build,
      testDetail,
      presentationOptions,
    );

    // const isDebugTask    = _def.isDebugTask;
    // const testSrcAbsPath = path.normalize(_def.srcFilePath);
    // const testFilter     = _def.testFilter ?? "";
    // const mainPkgPath    = _def.mainPkgPath ?? extSettings.buildRootDir;
    // const emitBinPath    = _def.emitBinPath ?? path.join(extSettings.taskBinDir, folder ? `test-${folder.name}.exe` : "test-zig.exe");
    // const testBinName    = path.basename(emitBinPath, ".exe");
    // const testArgs       = _def.testArgs?.map(configVal => resolveVariables(configVal)) ?? extSettings.taskTestArgs;
    // const debugArgs      = _def.debugArgs?.map(configVal => resolveVariables(configVal)) ?? extSettings.taskDebugArgs;
    // const shellArgs: string[] = ["test"]
    //   .concat(
    //     [testSrcAbsPath],
    //     mainPkgPath ? ["--main-pkg-path", `${mainPkgPath}`] : [],
    //     [`-femit-bin=${emitBinPath}`],
    //     testFilter ? ["--test-filter", `${testFilter}`,] : [],
    //     testArgs,
    //     isDebugTask ? [`--test-no-exec`] : [],
    //     [
    //       "--name",
    //       testBinName,
    //       "--enable-cache",
    //     ]
    //   );
    // this.logChannel.appendLine("Test ZigArgs:");
    // shellArgs.forEach(a => this.logChannel.appendLine(`  ${a}`));
    // const taskExec = new vscode.ShellExecution(
    //   extSettings.zigBinPath,
    //   shellArgs,
    //   { cwd: extSettings.buildRootDir }
    // );
    // const presentationOptions = _presentationOptions ?? <vscode.TaskPresentationOptions>{};
    // presentationOptions.echo             = true;
    // presentationOptions.showReuseMessage = false;
    // presentationOptions.clear            = true;
    // presentationOptions.reveal           = _presentationOptions?.reveal ?? (isDebugTask
    //   ? vscode.TaskRevealKind.Silent
    //   : vscode.TaskRevealKind.Always);
    // const task: ZigTask = new vscode.Task(
    //   <ZigTaskDefinition>{
    //     type:        ZigTaskProvider.TaskType,
    //     isDebugTask: isDebugTask,
    //     srcFilePath: testSrcAbsPath,
    //     testArgs:    testArgs,
    //     debugArgs:   debugArgs,
    //     testFilter:  testFilter,
    //     mainPkgPath: mainPkgPath,
    //     emitBinPath: emitBinPath,
    //     options:     { cwd: extSettings.buildRootDir },
    //   },
    //   folder ? folder : vscode.TaskScope.Workspace,
    //   testBinName,
    //   ZigTaskProvider.ProviderSrcStr,
    //   taskExec,
    //   extSettings.taskEnableProblemMatcher ? ZigTaskProvider.ProblemMatcher : undefined,
    // );
    // task.group = vscode.TaskGroup.Build;
    // task.detail = `zig build task: ${testBinName}`;
    // task.presentationOptions = presentationOptions;
    // return task;

  }

}

function normalizeShellArg(arg: string): string {
  arg = arg.trimLeft().trimRight();
  // Check if the arg is enclosed in backtick,
  // or includes unescaped double-quotes (or single-quotes on windows),
  // or includes unescaped single-quotes on mac and linux.
  if (/^`.*`$/g.test(arg) || /.*[^\\]".*/g.test(arg) ||
    (process.platform.includes("win") && /.*[^\\]'.*/g.test(arg)) ||
    (!process.platform.includes("win") && /.*[^\\]'.*/g.test(arg))) {
    return arg;
  }
  // The special character double-quote is already escaped in the arg.
  const unescapedSpaces: string | undefined = arg.split('').find((char, index) => index > 0 && char === " " && arg[index - 1] !== "\\");
  if (!unescapedSpaces && !process.platform.includes("win")) {
    return arg;
  } else if (arg.includes(" ")) {
    arg = arg.replace(/\\\s/g, " ");
    return "\"" + arg + "\"";
  } else {
    return arg;
  }
}

class ZigBuildTaskTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number>();
  public get onDidWrite(): vscode.Event<string> { return this.writeEmitter.event; }
  public get onDidClose(): vscode.Event<number> { return this.closeEmitter.event; }
  private readonly endOfLine: string = "\r\n";

  constructor(
    private extSettings: ZigExtSettings,
    private testName: string,
    private taskDef: ZigTaskDefinition,
  ) { }

  // At this point we can start using the terminal.
  async open(_initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
    this.writeEmitter.fire("Starting build..." + this.endOfLine);
    await this.doBuild();
  }

  // The terminal has been closed. Shutdown the build.
  close(): void { }

  private async doBuild(): Promise<any> {
    // Do build.
    const procName = this.extSettings.zigBinPath;
    const shellCommand = isWindows ? `cmd /c chcp 65001>nul && ${procName}` : procName;
    let resolvedCommand = procName;

    const taskDef = this.taskDef;
    const shellArgs: string[] = (<string[]>[])
      .concat(
        [
          "test",
          taskDef.srcFilePath,
        ],
        taskDef.mainPkgPath ? ["--main-pkg-path", taskDef.mainPkgPath] : [],
        [`-femit-bin=${taskDef.emitBinPath!}`],
        taskDef.testFilter ? ["--test-filter", taskDef.testFilter] : [],
        taskDef.testArgs!,
        taskDef.isDebugTask ? [`--test-no-exec`] : [],
        [
          "--name",
          this.testName,
          "--enable-cache",
        ]
      )
      .map((arg) => {
        const resolvedArg = normalizeShellArg(resolveVariables(arg));
        resolvedCommand = resolvedCommand + " " + resolvedArg;
        return resolvedArg;
      });
    const spawnOptions: cp.SpawnOptions = {
      shell: true,
      cwd: this.extSettings.buildRootDir,
    };

    this.writeEmitter.fire(resolvedCommand + this.endOfLine);
    try {
      let child: cp.ChildProcess | undefined = cp.spawn(shellCommand, shellArgs, spawnOptions);
      let stdout: string = "";
      let stderr: string = "";
      const result: number = await new Promise<number>(resolve => {
        if (child) {
          child.on('error', err => {
            this.splitWriteEmitter(err.message);
            stderr = err.message;
            resolve(-1);
          });
          child.stdout?.on('data', chunk => {
            const str: string = chunk.toString();
            this.splitWriteEmitter(chunk);
            stdout += str;
          });
          child.stderr?.on('data', chunk => {
            const str: string = chunk.toString();
            this.splitWriteEmitter(chunk);
            stderr += str;
          });
          child.on('close', result => {
            this.writeEmitter.fire(this.endOfLine);
            if (result === null) {
              this.writeEmitter.fire("Build run was terminated." + this.endOfLine);
              resolve(-1);
            }
            resolve(0);
          });
        }
      });
      this.printBuildSummary(
        (!stdout && stderr)
          ? stderr
          : (stdout ? stdout : "")
      );
      this.closeEmitter.fire(result);
    } catch {
      this.closeEmitter.fire(-1);
    }
  }

  private splitWriteEmitter(lines: string | Buffer) {
    const splitLines: string[] = lines.toString().split(/\r?\n/g);
    for (let i: number = 0; i < splitLines.length; i++) {
      let line = splitLines[i];
      // We may not get full lines, only output an endOfLine when a full line is detected
      if (i !== splitLines.length - 1) { line += this.endOfLine; }
      this.writeEmitter.fire(line);
    }
  }

  private printBuildSummary(stream: string): void {
    if (stream.includes("error")
    ) {
      this.writeEmitter.fire("Build finished with error(s)." + this.endOfLine);
    } else if (stream.includes("warning")) {
      this.writeEmitter.fire("Build finished with warning(s)." + this.endOfLine);
    } else {
      this.writeEmitter.fire("Build finished successfully." + this.endOfLine);
    }
  }
}