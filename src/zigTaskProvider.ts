'use strict';
import * as vscode from "vscode";
import { CmdConst, ExtConst } from "./zigConst";
import { zigContext } from "./zigContext";
import { cp, types, fs, ext, path } from './utils';
// import * as jsyaml from 'js-yaml';

interface ZigTestTaskDefinition extends vscode.TaskDefinition {
  testSrcFile: string;
  testName?: string;
  testFilter?: string;
  mainPkgPath?: string;
  testBinary?: string;
  debugMode?: boolean;
}
export class ZigTestTask extends vscode.Task { }

export class ZigTestTaskProvider implements vscode.TaskProvider {
  private registrations: vscode.Disposable[] = [];
  constructor() {
    this.registrations.push(
      vscode.commands.registerCommand(CmdConst.zig.test, async (testSrcFile: string, testFilter: string, debugMode: boolean) => {
        const zigTask = this.resolveTaskReal({
          type: ExtConst.testTaskType,
          testSrcFile: testSrcFile,
          testFilter: testFilter,
          debugMode: debugMode,
        });
        await this.runTask(zigTask, true);
      }),
    );
  }

  dispose(): void {
    this.registrations.forEach(d => void d.dispose());
    this.registrations = [];
  }
  public async provideTasks(_token: vscode.CancellationToken): Promise<ZigTestTask[]> {
    return Promise.resolve([]);
  }

  public async resolveTask(task: ZigTestTask, _token: vscode.CancellationToken): Promise<ZigTestTask | undefined> {
    if (!task.execution) {
      const taskDef = task.definition as ZigTestTaskDefinition;
      task = this.resolveTaskReal(taskDef);
      return Promise.resolve(task);
    }
    return Promise.resolve(undefined);
  }

  private async runTask(zigTask: ZigTestTask, updateLastRun: boolean): Promise<void> {
    if (updateLastRun) {
      // this.lastRanZigTask = zigTask;
      // void vscode.commands.executeCommand("setContext", "zig.hasLastRanTask", true);
    }
    try {
      const taskDef = zigTask.definition as ZigTestTaskDefinition;

      if (!taskDef.testBinary) {
        zigContext.logger.error(`Task doesn't have binary set.`, taskDef);
        return;
      }
      const testBinDir = path.dirname(taskDef.testBinary);
      if (!(await fs.dirExists(testBinDir))) {
        try { await fs.mkdir(testBinDir); } catch (err) {
          zigContext.logger.error(`Could not create testEmitBinDir: (${taskDef.testBinary}) does not exists.`, err);
          return;
        }
      }
      const execution = await vscode.tasks.executeTask(zigTask);
      if (taskDef.debugMode) {
        const program = taskDef.testBinary;
        const args = [zigContext.zigCfg.zig.binary];
        const cwd = path.dirname(taskDef.testBinary);
        await new Promise<void>((resolve, reject) => {
          let disposable: vscode.Disposable | undefined = undefined;
          disposable = vscode.tasks.onDidEndTask(async (e) => {
            if (e.execution !== execution) { return; }
            disposable?.dispose();
            disposable = undefined;
            try {
              await this.launchDebugger(program, args, cwd);
              resolve();
            }
            catch (err) {
              zigContext.logger.error(`Could not launch debugger`, err);
              reject();
            }
          });
        });
      }
    }
    catch (err) {
      zigContext.logger.error(`Could not execute task: ${zigTask.name}.`, err);
      return;
    }
  }
  private resolveTaskReal(
    taskDef: ZigTestTaskDefinition,
  ): ZigTestTask {
    const zig = zigContext.zigCfg.zig;
    taskDef.testSrcFile = path.normalize(taskDef.testSrcFile);
    taskDef.testName = taskDef.testName ?? `test-${path.filename(taskDef.testSrcFile)}`;
    taskDef.testBinary = taskDef.testBinary ?? path.join(zig.buildRootDir, "zig-out", "bin", `${taskDef.testName}.exe`);

    const varCtx = new ext.VariableResolver();
    const args = [
      "test",
      taskDef.testSrcFile,
      ...(taskDef.mainPkgPath ? ["--main-pkg-path", taskDef.mainPkgPath] : []),
      `-femit-bin=${taskDef.testBinary}`,
      ...(taskDef.testFilter ? ["--test-filter", taskDef.testFilter] : []),
      ...(taskDef.debugMode ? [`--test-no-exec`] : []),
      "--name", taskDef.testName,
      "--enable-cache",
    ].map(arg => varCtx.resolveVars(arg));

    const task = new ZigTestTask(
      taskDef,
      vscode.TaskScope.Workspace,
      taskDef.testName,
      ExtConst.taskProviderSourceStr,
      new vscode.ShellExecution(
        zig.binary, // ext.isWindows ? `cmd /c chcp 65001>nul && ${zig.binary}` : zig.binary;
        args,
        <vscode.ShellExecutionOptions>{ cwd: zig.buildRootDir },
      ),
      // new vscode.CustomExecution(async (_: vscode.TaskDefinition): Promise<vscode.Pseudoterminal> => {
      //   return Promise.resolve(new ZigBuildTerminal(
      //     zig.binary,
      //     shellArgs,
      //     shellCwd,
      //   ));
      // }),
      zig.enableTaskProblemMatcher ? ExtConst.problemMatcher : undefined,
    );
    task.group = vscode.TaskGroup.Build;
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      echo: true,
      focus: false,
      panel: vscode.TaskPanelKind.Shared,
      showReuseMessage: false,
      clear: true,
    };
    return task;
  }

  private async launchDebugger(
    program: string,
    args: string[],
    cwd: string,
  ): Promise<void> {
    if (!(await fs.fileExists(program))) { throw new Error(`Failed to find compiled test binary: (${program})`); }

    if (ext.isExtensionActive(ExtConst.cppToolsExtId)) {
      await vscode.debug.startDebugging(
        undefined,
        <vscode.DebugConfiguration>{
          type: 'cppvsdbg',
          name: `Zig Test Debug`,
          request: 'launch',
          console: 'integratedTerminal',
          program: program,
          args: args,
          cwd: cwd,
        },
      );
    }
    else if (ext.isExtensionActive(ExtConst.lldbExtId)) { throw new Error("codeLLDB temporarily disabled"); }
    else { throw new Error("cpptools/vscode-lldb extension must be enabled or installed."); }
  }

}

export class ZigBuildTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number>();
  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  onDidClose: vscode.Event<number> = this.closeEmitter.event;
  private buildProc?: cp.ProcessRun | undefined;

  constructor(
    private readonly shellCmd: string,
    private readonly shellArgs?: string[],              // Any arguments
    private readonly cwd?: string,              // Current working directory
  ) { }

  // At this point we can start using the terminal.
  async open(_initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
    try {
      // Do build.
      const processRun = cp.runProcess(
        this.shellCmd,
        <cp.ProcessRunOptions>{
          shellArgs: this.shellArgs,
          cwd: this.cwd,
          logger: zigContext.logger,
          onStart: () => this.emitLine("Starting build..."),
          onStdout: (str) => this.splitWriteEmitter(str),
          onStderr: (str) => this.splitWriteEmitter(str),
        }
      );
      // Emit Resolved command
      this.emitLine(processRun.procCmd);
      this.buildProc = processRun;
      const { stdout, stderr } = await processRun.completion;

      // printBuildSummary
      const hasStdOut = types.isNonBlank(stdout);
      const hasStdErr = types.isNonBlank(stderr);
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
    catch (err) {
      this.buildProc = undefined;
      this.emitLine("Build run was terminated");
      const stdout = (err as cp.ProcRunException)?.stdout;
      const stderr = (err as cp.ProcRunException)?.stderr;
      if (err) { this.splitWriteEmitter(String(err)); }
      if (stdout) { this.splitWriteEmitter(stdout); }
      if (stderr) { this.splitWriteEmitter(stderr); }
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
    this.writeEmitter.fire(ext.crlfString);
  }
  private splitWriteEmitter(lines: string | Buffer) {
    const splitLines: string[] = lines.toString().split(ext.eolRegEx);
    for (let i = 0; i < splitLines.length; i++) {
      let line = splitLines[i];
      // We may not get full lines, only output an eol when a full line is detected
      if (i !== splitLines.length - 1) { line += ext.crlfString; }
      this.writeEmitter.fire(line);
    }
  }

}