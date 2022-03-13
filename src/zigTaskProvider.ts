'use strict';
import * as vscode from "vscode";
import * as path from 'path';
import { ZigConst } from "./zigConst";
import { zigContext } from "./zigContext";
import { log, proc, fs, ext, isBlankString } from './utils';
// import * as jsyaml from 'js-yaml';

const cppToolsExtId = "ms-vscode.cpptools";
const lldbExtId = "vadimcn.vscode-lldb";

interface ZigTaskDefinition extends vscode.TaskDefinition {
  runInDebugger: boolean;
  srcFilePath: string;
  testArgs?: string[];
  debugArgs?: string[],
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
    taskDef: ZigTaskDefinition,
    scope: vscode.WorkspaceFolder | vscode.TaskScope.Global | vscode.TaskScope.Workspace,
    name: string,
    taskExec: vscode.ProcessExecution | vscode.ShellExecution | vscode.CustomExecution,
    enableProblemMatcher: boolean,
    group: vscode.TaskGroup,
    detail: string,
    presentationOptions: vscode.TaskPresentationOptions,
  ) {
    super(
      taskDef,
      scope,
      name,
      ZigConst.taskProviderSourceStr,
      taskExec,
      enableProblemMatcher ? ZigConst.problemMatcher : undefined,
    );
    this.group = group;
    this.detail = detail;
    this.presentationOptions = presentationOptions;

  }
}


export class ZigTaskProvider implements vscode.TaskProvider {
  private lastRanZigTask?: ZigTask = undefined;
  private registrations: vscode.Disposable[] = [];

  constructor() {
    this.registrations.push(
      vscode.commands.registerCommand("zig.test.run", async (filename: vscode.Uri, filter: string) => {
        const zigTask = this.getTask({
          type: ZigConst.taskScriptType,
          runInDebugger: false,
          srcFilePath: filename.fsPath,
          testFilter: filter,
        });
        await this._runTask(zigTask, true);
      }),
      vscode.commands.registerCommand("zig.test.debug", async (filename: vscode.Uri, filter: string) => {
        const zigTask = this.getTask({
          type: ZigConst.taskScriptType,
          runInDebugger: true,
          srcFilePath: filename.fsPath,
          testFilter: filter,
        });
        await this._runTask(zigTask, true);
      }),
      vscode.commands.registerCommand("zig.test.rerun", async (_) => {
        if (this.lastRanZigTask) {
          await this._runTask(this.lastRanZigTask, false);
        }
      }),
    );
  }

  dispose(): void {
    this.registrations.forEach(d => d.dispose());
    this.registrations = [];
  }

  public async provideTasks(): Promise<ZigTask[]> {
    const result: ZigTask[] = [
      // new vscode.Task(
      //   { type: ZigTaskProvider.ScriptType, task: "test" },
      //   vscode.workspace.workspaceFolders[0],
      //   "test",
      //   ZigTaskProvider.SourceStr,
      //   new vscode.ShellExecution("zig test")
      // ),
      // new vscode.Task(
      //   { type: ZigTaskProvider.ScriptType, task: "debug" },
      //   vscode.workspace.workspaceFolders[0],
      //   "debug",
      //   ZigTaskProvider.SourceStr,
      //   new vscode.ShellExecution("zig test")
      // ),
    ];
    return result;

  }

  public async resolveTask(task: ZigTask): Promise<ZigTask | undefined> {
    const execution: any = task.execution;
    if (!execution) {
      const taskDef: ZigTaskDefinition = <any>task.definition;
      task = this.getTask(
        taskDef,
        task.scope as vscode.WorkspaceFolder,
        task.presentationOptions,
      );
      return task;
    }
    return undefined;
  }

  private async _launchDebugger(
    folder: vscode.WorkspaceFolder | undefined,
    zigBinPath: string,
    testBinPath: string,
    debugArgs: string[],
  ): Promise<void> {
    const cppToolsExtActive = ext.isExtensionActive(cppToolsExtId);
    const codeLLDBExtActive = ext.isExtensionActive(lldbExtId);
    if (!cppToolsExtActive && !codeLLDBExtActive) {
      throw new Error("cpptools/vscode-lldb extension must be enabled or installed.");
    }
    if (!(await fs.fileExists(testBinPath))) {
      throw new Error(`Failed to find compiled test binary: (${testBinPath})`);
    }

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
      throw new Error("codeLLDB temporarily disabled");
      // const launch = Object.assign(
      //   {},
      //   {
      //     type: "lldb",
      //     request: "launch",
      //     name: "Zig Test Debug",
      //     program: testBinPath,
      //     args: [zigBinPath, ...debugArgs],
      //     cwd: folder,
      //     internalConsoleOptions: "openOnSessionStart",
      //     terminal: "console",
      //   }
      // );
      // let yamlStr = jsyaml.dump(launch, { condenseFlow: true, forceQuotes: true });
      // if (yamlStr.endsWith(",")) { yamlStr = yamlStr.substring(0, yamlStr.length - 1); }
      // await vscode.env
      //   .openExternal(vscode.Uri.parse(`${vscode.env.uriScheme}://vadimcn.vscode-lldb/launch/config?${yamlStr}`))
      //   .then((_) => { return true; });
    }
  }

  private async _runTask(zigTask: ZigTask, updateLastRun: boolean): Promise<void> {
    if (updateLastRun) {
      this.lastRanZigTask = zigTask;
      vscode.commands.executeCommand("setContext", "zig.hasLastRanTask", true);
    }

    const testEmitBinDir = path.dirname(zigTask.emitBinPath);
    if (!(await fs.dirExists(testEmitBinDir))) {
      try { await vscode.workspace.fs.createDirectory(vscode.Uri.file(testEmitBinDir)); } catch (err) {
        log.error(zigContext.zigChannel, `Could not create testEmitBinDir: (${zigTask.emitBinPath}) does not exists.\n  Error: ${err ?? "Unknown"}`);
        return;
      }
    }

    try {
      const execution = await vscode.tasks.executeTask(zigTask);
      await new Promise<void>((resolve, reject) => {
        let disposable: vscode.Disposable | undefined = vscode.tasks.onDidEndTask(async (e) => {
          if (e.execution !== execution) { return; }
          disposable!.dispose();
          disposable = undefined;
          const taskDef = <ZigTaskDefinition>zigTask.definition;
          if (taskDef.runInDebugger) {
            try {
              await this._launchDebugger(
                zigTask.scope as vscode.WorkspaceFolder,
                zigTask.zigBinPath,
                zigTask.emitBinPath,
                taskDef.debugArgs!,
              );
            }
            catch (err: any) {
              log.error(zigContext.zigChannel, `Could not launch debugger\n  Error ${err ?? "Error: Unknown"}`);
              reject();
            }
          }
          resolve();
        });
      });
    }
    catch (err) {
      log.error(zigContext.zigChannel, `Could not execute task: ${zigTask.name}.\n  Error: ${err ?? "Unknown"}`);
      return;
    }
  }

  private getTask(
    taskDef: ZigTaskDefinition,
    _folder?: vscode.WorkspaceFolder,
    _presentationOptions?: vscode.TaskPresentationOptions,
  ): ZigTask {
    const zigCfg = zigContext.zigCfg;
    const folder: vscode.WorkspaceFolder | undefined = _folder
      ?? (vscode.window.activeTextEditor
        ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
        : vscode.workspace.workspaceFolders?.[0]);


    const emitBinPath = taskDef.emitBinPath ?? path.join(zigCfg.taskBinDir, folder ? `test-${folder.name}.exe` : "test-zig.exe");
    const testName = path.parse(emitBinPath).name;

    taskDef.srcFilePath = path.normalize(taskDef.srcFilePath);
    taskDef.debugArgs = taskDef.debugArgs ?? [];
    taskDef.testArgs = taskDef.testArgs ?? [];
    taskDef.mainPkgPath = taskDef.mainPkgPath ?? zigCfg.buildRootDir;
    taskDef.emitBinPath = emitBinPath;
    taskDef.options = {
      cwd: taskDef.options?.cwd ?? zigCfg.buildRootDir,
    };

    return new ZigTask(
      zigCfg.zigBinPath,
      emitBinPath,
      taskDef,
      folder ? folder : vscode.TaskScope.Workspace,
      testName,
      new vscode.CustomExecution(async (resolvedTaskDef: vscode.TaskDefinition): Promise<vscode.Pseudoterminal> => {
        return new ZigBuildTerminal(
          zigCfg.zigBinPath,
          testName,
          <ZigTaskDefinition>resolvedTaskDef,
        );
      }),
      zigCfg.taskEnableProblemMatcher,
      vscode.TaskGroup.Build,
      `zig build task: ${testName}`,
      Object.assign(
        <vscode.TaskPresentationOptions>{
          reveal: taskDef.runInDebugger ? vscode.TaskRevealKind.Silent : vscode.TaskRevealKind.Always,
          echo: true,
          showReuseMessage: false,
          clear: true,
        },
        _presentationOptions ?? {}
      ),
    );
  }

}

class ZigBuildTerminal implements vscode.Pseudoterminal {
  private static readonly endOfLine: string = "\r\n";
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number>();
  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  onDidClose: vscode.Event<number> = this.closeEmitter.event;
  private buildProc?: proc.ProcessRun | undefined;

  constructor(
    private readonly zigBinPath: string,
    private readonly testName: string,
    private readonly taskDef: ZigTaskDefinition,
  ) { }

  // At this point we can start using the terminal.
  async open(_initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
    try {
      // Do build.
      const processRun = proc.runProcess(
        this.zigBinPath, // proc.isWindows ? `cmd /c chcp 65001>nul && ${this.zigBinPath}` : this.zigBinPath;
        <proc.ProcessRunOptions>{
          shellArgs: ["test"]
            .concat(
              this.taskDef.srcFilePath,
              ...(this.taskDef.mainPkgPath ? ["--main-pkg-path", this.taskDef.mainPkgPath] : []),
              `-femit-bin=${this.taskDef.emitBinPath!}`,
              ...(this.taskDef.testFilter ? ["--test-filter", this.taskDef.testFilter] : []),
              ...(this.taskDef.testArgs ?? []),
              ...(this.taskDef.runInDebugger ? [`--test-no-exec`] : []),
              "--name",
              this.testName,
              "--enable-cache",
            )
            .map(arg => ext.resolveVariables(arg)),
          cwd:                this.taskDef.options?.cwd,
          showMessageOnError: true,
          onStart:            () => this.emitLine("Starting build..."),
          onStdout:           (str) => this.splitWriteEmitter(str),
          onStderr:           (str) => this.splitWriteEmitter(str),
          notFoundText:       `${this.zigBinPath} not found`,
        }
      );
      // Emit Resolved command
      this.emitLine(processRun.procCmd);
      this.buildProc = processRun;
      const { stdout, stderr } = await processRun.completion;

      // printBuildSummary
      const hasStdOut = !isBlankString(stdout);
      const hasStdErr = !isBlankString(stderr);
      if (
        (!hasStdOut && hasStdErr && stderr.includes("error"))
        || (hasStdOut && stdout.includes("error"))
      ) {
        this.emitLine("Build finished with error(s)");
      } else if (
        (!hasStdOut && hasStdErr && stderr.includes("warning"))
        || (hasStdOut && stdout.includes("warning"))
      ) {
        this.emitLine("Build finished with warning(s)");
      } else {
        this.emitLine("Build finished successfully");
      }
      this.buildProc = undefined;
      this.closeEmitter.fire(0);
    }
    catch (err: any) {
      this.buildProc = undefined;
      this.emitLine("Build run was terminated");
      if (err) { this.splitWriteEmitter(`${err}`); }
      if (err?.stderr) { this.splitWriteEmitter(err.stderr); }
      if (err?.stdout) { this.splitWriteEmitter(err.stdout); }
      this.closeEmitter.fire(-1);
    }
  }

  // The terminal has been closed. Shutdown the build.
  close(): void {
    if (!this.buildProc || !this.buildProc.isRunning()) { return; }
    this.buildProc.kill();
    this.buildProc = undefined;
    this.emitLine("Build run was cancelled");
  }

  private emitLine(text: string) {
    this.writeEmitter.fire(text);
    this.writeEmitter.fire(ZigBuildTerminal.endOfLine);
  }
  private splitWriteEmitter(lines: string | Buffer) {
    const splitLines: string[] = lines.toString().split(/\r?\n/g);
    for (let i: number = 0; i < splitLines.length; i++) {
      let line = splitLines[i];
      // We may not get full lines, only output an eol when a full line is detected
      if (i !== splitLines.length - 1) { line += ZigBuildTerminal.endOfLine; }
      this.writeEmitter.fire(line);
    }
  }

}