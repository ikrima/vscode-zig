'use strict';
import * as vscode from "vscode";
import { CmdConst, ExtConst } from "./zigConst";
import { zigContext } from "./zigContext";
import { cp, types, fs, ext, path } from './utils';
// import * as jsyaml from 'js-yaml';

type ZigRun = {
  program: string;
  args: string[];
  cwd?: string;
};

interface ZigTestTaskDefinition extends vscode.TaskDefinition {
  testSrcFile: string;
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

      const debugRun: ZigRun | undefined = taskDef.debugMode
          ? {
            program: taskDef.testBinary,
            args: [zigContext.zigCfg.zig.binary],
            cwd: path.dirname(taskDef.testBinary),
          }
          : undefined;
      const execution = await vscode.tasks.executeTask(zigTask);
      await new Promise<void>((resolve, reject) => {
        let disposable: vscode.Disposable | undefined = vscode.tasks.onDidEndTask(async (e) => {
          if (e.execution !== execution) { return; }
          disposable?.dispose();
          disposable = undefined;
          try {
            if (debugRun) { await this.launchDebugger(debugRun); }
            resolve();
          }
          catch (err) {
            zigContext.logger.error(`Could not launch debugger`, err);
            reject();
          }
        });
      });
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
    const wksFolder: vscode.WorkspaceFolder | undefined = vscode.window.activeTextEditor
      ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
      : vscode.workspace.workspaceFolders?.[0];


    taskDef.testBinary = taskDef.testBinary ?? path.join(
      zig.buildRootDir,
      "zig-out",
      "bin",
      wksFolder ? `test-${wksFolder.name}.exe` : "test-zig.exe",
    );
    taskDef.testSrcFile = path.normalize(taskDef.testSrcFile);
    const testName = path.filename(taskDef.testBinary);

    const shellCmd = zigContext.zigCfg.zig.binary; // ext.isWindows ? `cmd /c chcp 65001>nul && ${zig.binary}` : zig.binary;
    const varCtx = new ext.VariableResolver();
    const shellArgs = [
      "test",
      taskDef.testSrcFile,
      ...(taskDef.mainPkgPath ? ["--main-pkg-path", taskDef.mainPkgPath] : []),
      `-femit-bin=${taskDef.testBinary ?? ""}`,
      ...(taskDef.testFilter ? ["--test-filter", taskDef.testFilter] : []),
      ...(taskDef.debugMode ? [`--test-no-exec`] : []),
      "--name",
      testName,
      "--enable-cache",
    ].map(arg => varCtx.resolveVars(arg));
    const shellCwd = zig.buildRootDir;

    const task = new ZigTestTask(
      taskDef,
      vscode.TaskScope.Workspace,
      testName,
      ExtConst.taskProviderSourceStr,
      new vscode.CustomExecution(async (_: vscode.TaskDefinition): Promise<vscode.Pseudoterminal> => {
        return Promise.resolve(new ZigBuildTerminal(
          shellCmd,
          shellArgs,
          shellCwd,
        ));
      }),
      zig.enableTaskProblemMatcher ? ExtConst.problemMatcher : undefined,
    );
    task.group = vscode.TaskGroup.Build;
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Silent,
      echo: true,
      showReuseMessage: false,
      clear: true,
    };
    return task;
  }

  private async launchDebugger(zigRun: ZigRun): Promise<void> {
    const cppToolsExtActive = ext.isExtensionActive(ExtConst.cppToolsExtId);
    const codeLLDBExtActive = ext.isExtensionActive(ExtConst.lldbExtId);
    if (!cppToolsExtActive && !codeLLDBExtActive) {
      throw new Error("cpptools/vscode-lldb extension must be enabled or installed.");
    }
    if (!(await fs.fileExists(zigRun.program))) {
      throw new Error(`Failed to find compiled test binary: (${zigRun.program})`);
    }

    if (cppToolsExtActive) {
      await vscode.debug.startDebugging(
        undefined,
        <vscode.DebugConfiguration>{
          type: 'cppvsdbg',
          name: `Zig Test Debug`,
          request: 'launch',
          console: 'integratedTerminal',
          ...zigRun,
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
      //     program: program,
      //     args: [zig.binary, ...debugArgs],
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

}

class ZigBuildTerminal implements vscode.Pseudoterminal {
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