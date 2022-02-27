'use strict';
import * as vscode from "vscode";
import * as path from 'path';
import * as utils from './utils';
import { ZigConfig } from "./zigConfig";
import * as jsyaml from 'js-yaml';

const cppToolsExtId = "ms-vscode.cpptools";
const lldbExtId = "vadimcn.vscode-lldb";

interface ZigTaskDefinition extends vscode.TaskDefinition {
  type: string;
  isDebugTask: boolean;
  srcFilePath: string;
  testArgs?: string[];
  testFilter?: string;
  mainPkgPath?: string;
  emitBinPath?: string;
  options?: {
    cwd?: string;
  };
};
export class ZigTask extends vscode.Task {
  constructor(
    public zigBinPath: string,
    public emitBinPath: string,
    public isDebugTask: boolean,
    public debugArgs: string[],
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


export class ZigTaskProvider implements vscode.TaskProvider {
  private lastRanZigTask?: ZigTask = undefined;
  static readonly ProviderSrcStr: string = 'zig';  // eslint-disable-line @typescript-eslint/naming-convention
  static readonly TaskType: string = 'zig';  // eslint-disable-line @typescript-eslint/naming-convention
  static readonly ProblemMatcher: string = '$zig'; // eslint-disable-line @typescript-eslint/naming-convention

  constructor(
    context: vscode.ExtensionContext,
    private logChannel: vscode.OutputChannel,
  ) {
    context.subscriptions.push(
      vscode.commands.registerCommand("zig.test.run", async (filename: vscode.Uri, filter: string) => {
        const zigTask = this.getTask({
          type: ZigTaskProvider.TaskType,
          isDebugTask: false,
          srcFilePath: filename.fsPath,
          testFilter: filter,
        });
        await this._runTask(zigTask, true);
      })
    );
    context.subscriptions.push(
      vscode.commands.registerCommand("zig.test.debug", async (filename: vscode.Uri, filter: string) => {
        const zigTask = this.getTask({
          type: ZigTaskProvider.TaskType,
          isDebugTask: true,
          srcFilePath: filename.fsPath,
          testFilter: filter,
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

  private async _launchDebugger(
    folder: vscode.WorkspaceFolder | undefined,
    zigBinPath: string,
    testBinPath: string,
    debugArgs: string[],
  ): Promise<void> {
    const cppToolsExtActive = utils.isExtensionActive(cppToolsExtId);
    const codeLLDBExtActive = utils.isExtensionActive(lldbExtId);
    if (!cppToolsExtActive && !codeLLDBExtActive) {
      const errMsg = "cpptools/vscode-lldb extension must be enabled or installed.";
      this.logChannel.appendLine(errMsg);
      this.logChannel.show();
      throw new Error(errMsg);
    }
    try { await utils.fileExists(testBinPath); } catch (err) {
      this.logChannel.appendLine(`Failed to compiled test binary: (${testBinPath})\n  FileSystemError: ${err ?? "Unknown"}`);
      this.logChannel.show();
      throw err;
    }
    try {
      if (cppToolsExtActive) {
        await vscode.debug.startDebugging(
          folder,
          {
            type: 'cppvsdbg',
            name: `Zig Test Debug`,
            request: 'launch',
            program: testBinPath,
            args: [zigBinPath, ...debugArgs],
            cwd: folder,
            console: 'integratedTerminal',
          },
        );
      } else {
        const launch = Object.assign(
          {},
          {
            type: "lldb",
            request: "launch",
            name: "Zig Test Debug",
            program: testBinPath,
            args: [zigBinPath, ...debugArgs],
            cwd: folder,
            internalConsoleOptions: "openOnSessionStart",
            terminal: "console",
          }
        );
        let yamlStr = jsyaml.dump(launch, { condenseFlow: true, forceQuotes: true });
        if (yamlStr.endsWith(",")) { yamlStr = yamlStr.substring(0, yamlStr.length - 1); }
        await vscode.env
          .openExternal(vscode.Uri.parse(`${vscode.env.uriScheme}://vadimcn.vscode-lldb/launch/config?${yamlStr}`))
          .then((_) => { return true; });
      }
    }
    catch (err) {
      this.logChannel.appendLine(`Could not launch debugger\n  Error: ${err ?? "Unknown"}`);
      this.logChannel.show();
      throw err;
    }
  }

  private async _runTask(zigTask: ZigTask, updateLastRun: boolean): Promise<void> {
    if (updateLastRun) {
      this.lastRanZigTask = zigTask;
      vscode.commands.executeCommand("setContext", "zig.hasLastRanTask", true);
    }

    try {
      const testEmitBinDir = path.dirname(zigTask.emitBinPath);
      if (!(await utils.dirExists(testEmitBinDir))) { await vscode.workspace.fs.createDirectory(vscode.Uri.file(testEmitBinDir)); }
    } catch (err) {
      this.logChannel.appendLine(`Could not create testEmitBinDir: (${zigTask.emitBinPath}) does not exists.\n  Error: ${err ?? "Unknown"}`);
      this.logChannel.show();
      throw err;
    }

    try {
      const execution = await vscode.tasks.executeTask(zigTask);
      return new Promise<void>(resolve => {
        let disposable: vscode.Disposable | undefined = vscode.tasks.onDidEndTask(async (e) => {
          if (!disposable || e.execution !== execution) { return; }
          disposable.dispose();
          disposable = undefined;
          if (zigTask.isDebugTask) {
            this._launchDebugger(
              zigTask.scope as vscode.WorkspaceFolder,
              zigTask.zigBinPath,
              zigTask.emitBinPath,
              zigTask.debugArgs,
            );
          }
          resolve();
        });
      });
    }
    catch (err) {
      this.logChannel.appendLine(`Could not execute task: ${zigTask.name}.\n  Error: ${err ?? "Unknown"}`);
      this.logChannel.show();
      throw err;
    }
  }

  private getTask(
    _def: ZigTaskDefinition,
    _folder?: vscode.WorkspaceFolder,
    _presentationOptions?: vscode.TaskPresentationOptions,
  ): ZigTask {
    const zigCfg = ZigConfig.get();
    const folder: vscode.WorkspaceFolder | undefined = _folder
      ?? (vscode.window.activeTextEditor
        ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
        : vscode.workspace.workspaceFolders?.[0]);

    const presentationOptions = _presentationOptions ?? <vscode.TaskPresentationOptions>{};
    presentationOptions.echo = true;
    presentationOptions.showReuseMessage = false;
    presentationOptions.clear = true;
    presentationOptions.reveal = _presentationOptions?.reveal ?? (_def.isDebugTask
      ? vscode.TaskRevealKind.Silent
      : vscode.TaskRevealKind.Always);

    const debugArgs = _def.debugArgs ?? zigCfg.taskDebugArgs;
    const emitBinPath = _def.emitBinPath ?? path.join(zigCfg.taskBinDir, folder ? `test-${folder.name}.exe` : "test-zig.exe");
    const testName = path.parse(emitBinPath).name;
    const testDetail = `zig build task: ${testName}`;
    return new ZigTask(
      zigCfg.zigBinPath,
      emitBinPath,
      _def.isDebugTask,
      debugArgs.map((configVal: string) => utils.resolveVariables(configVal)) ?? [],
      <ZigTaskDefinition>{
        type: ZigTaskProvider.TaskType,
        isDebugTask: _def.isDebugTask,
        srcFilePath: path.normalize(_def.srcFilePath),
        testArgs: _def.testArgs ?? zigCfg.taskTestArgs,
        debugArgs: debugArgs,
        testFilter: _def.testFilter,
        mainPkgPath: _def.mainPkgPath ?? zigCfg.buildRootDir,
        emitBinPath: emitBinPath,
        options: {
          cwd: zigCfg.buildRootDir,
        },
      },
      folder ? folder : vscode.TaskScope.Workspace,
      testName,
      new vscode.CustomExecution(async (resolvedTaskDef: vscode.TaskDefinition): Promise<vscode.Pseudoterminal> => {
        return new ZigBuildTaskTerminal(
          zigCfg.zigBinPath,
          testName,
          <ZigTaskDefinition>resolvedTaskDef,
        );
      }),
      zigCfg.taskEnableProblemMatcher ? ZigTaskProvider.ProblemMatcher : undefined,
      vscode.TaskGroup.Build,
      testDetail,
      presentationOptions,
    );
  }

}

const endOfLine: string = "\r\n";
class ZigBuildTaskTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number>();
  private runningCmd: utils.RunningCmd | undefined;
  public get onDidWrite(): vscode.Event<string> { return this.writeEmitter.event; }
  public get onDidClose(): vscode.Event<number> { return this.closeEmitter.event; }

  constructor(
    private zigBinPath: string,
    private testName: string,
    private taskDef: ZigTaskDefinition,
  ) { }

  // At this point we can start using the terminal.
  async open(_initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
    try {
      this.runningCmd = <utils.RunningCmd>this.doBuild();
      const { stdout, stderr } = await this.runningCmd;

      // printBuildSummary
      const hasStdOut = !utils.isBlank(stdout);
      const hasStdErr = !utils.isBlank(stderr);
      if (
           (!hasStdOut && hasStdErr && stderr.includes("error"))
        || ( hasStdOut && stdout.includes("error"))
      ) {
        this.writeEmitter.fire(`Build finished with error(s). ${endOfLine}`);
      } else if (
           (!hasStdOut && hasStdErr && stderr.includes("warning"))
        || ( hasStdOut && stdout.includes("warning"))
      ) {
        this.writeEmitter.fire(`Build finished with warning(s). ${endOfLine}`);
      } else {
        this.writeEmitter.fire(`Build finished successfully. ${endOfLine}`);
      }
      this.runningCmd = undefined;
      this.closeEmitter.fire(0);
    }
    catch (err: any) {
      this.runningCmd = undefined;
      this.writeEmitter.fire(`Build run was terminated. ${endOfLine}`);
      if (err?.message) { this.splitWriteEmitter(err.message); }
      if (err?.stderr) { this.splitWriteEmitter(err.stderr); }
      if (err?.stdout) { this.splitWriteEmitter(err.stdout); }
      this.closeEmitter.fire(-1);
    }
  }

  // The terminal has been closed. Shutdown the build.
  close(): void {
    if (this.runningCmd) {
      this.runningCmd.kill();
      this.runningCmd = undefined;
      this.writeEmitter.fire(`Build run was terminated. ${endOfLine}`);
    }
   }

  private async doBuild(): Promise<{ stdout: string; stderr: string }> {
    // Do build.
    const procCmd = this.zigBinPath; // utils.isWindows ? `cmd /c chcp 65001>nul && ${this.zigBinPath}` : this.zigBinPath;

    const taskDef = this.taskDef;
    const shellArgs: string[] = (<string[]>[])
      .concat(
        "test",
        taskDef.srcFilePath,
        taskDef.mainPkgPath ? ["--main-pkg-path", taskDef.mainPkgPath] : [],
        `-femit-bin=${taskDef.emitBinPath!}`,
        taskDef.testFilter ? ["--test-filter", taskDef.testFilter] : [],
        taskDef.testArgs!,
        taskDef.isDebugTask ? [`--test-no-exec`] : [],
        "--name",
        this.testName,
        "--enable-cache",
      )
      .map(arg => utils.resolveVariables(arg));

    // Emit Resolved command
    const resolvedCommand = `${[procCmd].concat(...shellArgs).join(' ')} ${endOfLine}`;
    this.writeEmitter.fire(resolvedCommand);
    return utils.runCmd(
      procCmd,
      {
        shellArgs: shellArgs,
        cwd: this.taskDef.options?.cwd,
        showMessageOnError: true,
        onStart: () => this.writeEmitter.fire(`Starting build...${endOfLine}`),
        onStdout: (str) => this.splitWriteEmitter(str),
        onStderr: (str) => this.splitWriteEmitter(str),
        notFoundText: `${this.zigBinPath} not found`,
      });
  }

  private splitWriteEmitter(lines: string | Buffer) {
    const splitLines: string[] = lines.toString().split(/\r?\n/g);
    for (let i: number = 0; i < splitLines.length; i++) {
      let line = splitLines[i];
      // We may not get full lines, only output an eol when a full line is detected
      if (i !== splitLines.length - 1) { line += endOfLine; }
      this.writeEmitter.fire(line);
    }
  }

}