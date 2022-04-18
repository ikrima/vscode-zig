'use strict';
import * as vscode from "vscode";
import { CmdConst, ExtConst } from "./zigConst";
import { ZigExt } from "./zigContext";
import { cp, types, fs, ext, path } from './utils';
import type { ExecFileOptionsWithStringEncoding } from 'child_process';
// import * as jsyaml from 'js-yaml';

export namespace zig_build {
  type ZigBldStep = {
    stepName: string;
    stepDesc: string;
    isDefault: boolean;
  };
  const stepsRegEx = /\s+(?<step>\S+)\s(?<dflt>\(default\))?\s*(?<desc>[^\n]+)\n?/g;

  const rawGetBuildSteps = async function (): Promise<ZigBldStep[]> {
    const zig = ZigExt.zigCfg.zig;
    if (!await fs.fileExists(zig.buildFile)) {
      ZigExt.logger.error("Aborting build target fetch. No build.zig file found in workspace root.");
      return Promise.reject();
    }

    try {
      const { stdout, stderr } = await cp.execFile(
        zig.binary,
        [
          "build",
          "--help",
          ...[`--build-file`, zig.buildFile],
        ],
        <ExecFileOptionsWithStringEncoding>{
          encoding: 'utf8',
          cwd: zig.buildRootDir,
          shell: vscode.env.shell,
        }
      );

      if (types.isNonBlank(stderr)) {
        ZigExt.logger.error(`zig build errors\n${stderr}`);
        return Promise.reject();
      }
      const stepsIdx = stdout.indexOf("Steps:");
      const genOpIdx = stdout.indexOf("General Options:", stepsIdx);
      const stepsStr = stdout.substring(stepsIdx, genOpIdx);
      return Array.from(
        stepsStr.matchAll(stepsRegEx),
        (m: RegExpMatchArray, _): ZigBldStep => {
          return {
            stepName: m[1],
            stepDesc: m[3],
            isDefault: !types.isNullOrUndefined(m[2])
          };
        },
      );
    }
    catch (e) {
      ZigExt.logger.error('zig build errors', e);
      return Promise.reject();
    }
  };

  const rawPickBuildStep = async function (bldSteps: Promise<ZigBldStep[]>): Promise<string | undefined> {
    type StepPickItem = { step: ZigBldStep } & vscode.QuickPickItem;
    const stepItems = bldSteps.then(steps => {
      return steps.map(s => <StepPickItem>{
        step: s,
        label: s.stepName,
        description: s.stepDesc,
      });
    });
    const picked = await vscode.window.showQuickPick(
      stepItems,
      <vscode.QuickPickOptions>{
        canPickMany: false,
        placeHolder: "Select the zig target to run",
      },
    );
    return picked?.step.stepName;
  };
  interface ZigBuildTaskDefinition extends vscode.TaskDefinition {
    stepName: string;
    buildFile?: string;
    args?: string[];
    cwd?: string;
  }
  class ZigBuildTask extends vscode.Task { }

  class ZigBuildTaskProvider implements vscode.TaskProvider {
    private _cachedBldSteps:   ZigBldStep[] | undefined             = undefined;
    private _cachedBldTasks:   ZigBuildTask[] | undefined           = undefined;
    private _cachedPickedStep: string | undefined                   = undefined;
    private fileWatcher:       vscode.FileSystemWatcher | undefined = undefined;
    private registrations:     vscode.Disposable[]                  = [];

    public dispose(): void {
      this.registrations.forEach(d => void d.dispose());
      this.registrations = [];
      this.fileWatcher?.dispose();
    }
    public register() {
      this.fileWatcher = vscode.workspace.createFileSystemWatcher(ZigExt.zigCfg.zig.buildFile);
      this.fileWatcher.onDidChange(() => this.invalidateTasksCache());
      this.fileWatcher.onDidCreate(() => this.invalidateTasksCache());
      this.fileWatcher.onDidDelete(() => this.invalidateTasksCache());

      this.registrations.push(
        vscode.tasks.registerTaskProvider(ExtConst.buildTaskType, this),
        vscode.commands.registerCommand(CmdConst.zig.runBuildStep, async (stepName: string) => {
          await this.runBuildStep(stepName);
        }),
        vscode.commands.registerCommand(CmdConst.zig.buildLastTarget, async (forcePick?: boolean) => {
          const pickedStep = await this.cachedPickedStep(forcePick);
          if (!pickedStep) { return; }
          await this.runBuildStep(pickedStep);
        }),
      );

      // const zigFormatStatusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem("zig.statusBar", vscode.StatusBarAlignment.Left);
      // zigFormatStatusBar.name = "zig build";
      // zigFormatStatusBar.text = "$(wrench) zig build workspace";
      // zigFormatStatusBar.tooltip = "zig build workspace";
      // zigFormatStatusBar.command = "zig.runBuildStep";
      // zigFormatStatusBar.show();
    }
    public async provideTasks(_token: vscode.CancellationToken): Promise<ZigBuildTask[]> {
      const tasks = await this.cachedBuildTasks();
      return tasks;
    }
    // Resolves a task that has no [`execution`](#Task.execution) set.
    public resolveTask(task: ZigBuildTask, _token: vscode.CancellationToken): ZigBuildTask | undefined {
      if (task.definition['stepName']) {
        return !task.execution
          ? this.makeZigTask(task.definition as ZigBuildTaskDefinition)
          : task;
      }
      return undefined;
    }

    private invalidateTasksCache(): void {
      this._cachedBldSteps   = undefined;
      this._cachedBldTasks   = undefined;
      this._cachedPickedStep = undefined;
    }

    private async cachedBuildSteps(force?: boolean): Promise<ZigBldStep[]> {
      try {
        if (force || !this._cachedBldSteps) {
          this._cachedBldSteps = await rawGetBuildSteps();
        }
        return this._cachedBldSteps;
      }
      catch (e) {
        this._cachedBldSteps = undefined;
        ZigExt.logger.error('zig build errors', e);
        return Promise.reject();
      }
    }

    private async cachedBuildTasks(force?: boolean): Promise<ZigBuildTask[]> {
      try {
        if (force || !this._cachedBldTasks) {
          this._cachedBldTasks = (await this.cachedBuildSteps())
            .map(s => this.makeZigTask({ type: ExtConst.buildTaskType, stepName: s.stepName }));
        }
        return this._cachedBldTasks;
      }
      catch (e) {
        this._cachedBldTasks = undefined;
        ZigExt.logger.error('zig build errors', e);
        return Promise.reject();
      }
    }

    private async cachedPickedStep(forcePick?: boolean): Promise<string | undefined> {
      const pickedStep = (forcePick || !this._cachedPickedStep)
        ? await rawPickBuildStep(this.cachedBuildSteps())
        : this._cachedPickedStep;
      if (pickedStep) { this._cachedPickedStep = pickedStep; }
      return pickedStep;
    }

    private async runBuildStep(stepName: string): Promise<void> {
      const bldTask = this.makeZigTask({ type: ExtConst.buildTaskType, stepName: stepName });
      await vscode.tasks.executeTask(bldTask);
    }
    private makeZigTask(taskDef: ZigBuildTaskDefinition): ZigBuildTask {
      const zig = ZigExt.zigCfg.zig;
      taskDef.args = taskDef.args ?? [];
      taskDef.cwd = taskDef.cwd ?? zig.buildRootDir;
      taskDef.buildFile = taskDef.buildFile ?? zig.buildFile;

      const task = new ZigBuildTask(
        taskDef,
        vscode.TaskScope.Workspace,
        taskDef.stepName,
        ExtConst.taskProviderSourceStr,
        new vscode.ShellExecution(
          zig.binary,
          [
            "build",
            taskDef.stepName,
            ...[`--build-file`, zig.buildFile],
            ...(taskDef.args)
          ],
          <vscode.ShellExecutionOptions>{ cwd: taskDef.cwd },
        ),
        ExtConst.problemMatcher
      );
      const stepNameLower = taskDef.stepName.toLowerCase();
      if (stepNameLower.includes("build")) { task.group = vscode.TaskGroup.Build; }
      else if (stepNameLower.includes("test")) { task.group = vscode.TaskGroup.Test; }
      task.detail = `zig build ${taskDef.stepName}`;
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
  }
  export function createTaskProvider(): vscode.Disposable {
    const zigBuildTaskProvider = new ZigBuildTaskProvider();
    zigBuildTaskProvider.register();
    return zigBuildTaskProvider;
  }
}

export namespace zig_test {
  interface ZigTestTaskDefinition extends vscode.TaskDefinition {
    testSrcFile: string;
    testName?: string;
    testFilter?: string;
    mainPkgPath?: string;
    testBinary?: string;
    debugMode?: boolean;
  }
  class ZigTestTask extends vscode.Task { }

  class ZigTestTaskProvider implements vscode.TaskProvider {
    private registrations: vscode.Disposable[] = [];
    register() {
      this.registrations.push(
        vscode.tasks.registerTaskProvider(ExtConst.testTaskType, this),
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
          ZigExt.logger.error(`Task doesn't have binary set.`, taskDef);
          return;
        }
        const testBinDir = path.dirname(taskDef.testBinary);
        if (!(await fs.dirExists(testBinDir))) {
          try { await fs.mkdir(testBinDir); } catch (err) {
            ZigExt.logger.error(`Could not create testEmitBinDir: (${taskDef.testBinary}) does not exists.`, err);
            return;
          }
        }
        const execution = await vscode.tasks.executeTask(zigTask);
        if (taskDef.debugMode) {
          const program = taskDef.testBinary;
          const args = [ZigExt.zigCfg.zig.binary];
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
                ZigExt.logger.error(`Could not launch debugger`, err);
                reject();
              }
            });
          });
        }
      }
      catch (err) {
        ZigExt.logger.error(`Could not execute task: ${zigTask.name}.`, err);
        return;
      }
    }
    private resolveTaskReal(
      taskDef: ZigTestTaskDefinition,
    ): ZigTestTask {
      const zig = ZigExt.zigCfg.zig;
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

  export function createTaskProvider(): vscode.Disposable {
    const zigTestTaskProvider = new ZigTestTaskProvider();
    zigTestTaskProvider.register();
    return zigTestTaskProvider;
  }
}



//  class ZigBuildHelper {
//    private cachedSteps: ZigBldStep[] | null = null;
//    private cachedPick: ZigBldStep | null = null;
//    public async getBuildSteps(forceReload: boolean): Promise<ZigBldStep[]> {
//      if (forceReload || !this.cachedSteps) {
//        const zig = ZigExt.zigCfg.zig;
//        if (!await fs.fileExists(zig.buildFile)) {
//          ZigExt.logger.error("Aborting build target fetch. No build.zig file found in workspace root.");
//          return Promise.reject();
//        }
//        try {
//          const { stdout, stderr } = await cp.execFile(
//            zig.binary,
//            [
//              "build",
//              "--help",
//              ...[`--build-file`, zig.buildFile],
//            ],
//            <ExecFileOptionsWithStringEncoding>{
//              encoding: 'utf8',
//              cwd: zig.buildRootDir,
//              shell: vscode.env.shell,
//            }
//          );
//
//          if (types.isNonBlank(stderr)) {
//            ZigExt.logger.error(`zig build errors\n${stderr}`);
//            return Promise.reject();
//          }
//          const stepsIdx = stdout.indexOf("Steps:");
//          const genOpIdx = stdout.indexOf("General Options:", stepsIdx);
//          const stepsStr = stdout.substring(stepsIdx, genOpIdx);
//          this.cachedSteps = Array.from(
//            stepsStr.matchAll(stepsRegEx),
//            (m: RegExpMatchArray, _): ZigBldStep => {
//              return {
//                kind: 'zigBldStep',
//                stepName: m[1],
//                stepDesc: m[3],
//                isDefault: !types.isNullOrUndefined(m[2])
//              };
//            },
//          );
//
//        }
//        catch (e) {
//          ZigExt.logger.error('zig build errors', e);
//          return Promise.reject();
//        }
//
//      }
//      return this.cachedSteps;
//    }
//    public async pickBuildStep(forcePick: boolean): Promise<ZigBldStep | null> {
//      if (forcePick || !this.cachedPick) {
//        type StepPickItem = { step: ZigBldStep } & vscode.QuickPickItem;
//        // const steps = await this.getBuildSteps(forcePick);
//        // const stepItems = Array.from(steps, (s): StepPickItem => {
//        //   return {
//        //     step: s,
//        //     label: s.stepName,
//        //     description: s.stepDesc,
//        //   };
//        // });
//        const stepItems = this
//          .getBuildSteps(false)
//          .then(steps => {
//            return steps.map(s => <StepPickItem>{
//              step: s,
//              label: s.stepName,
//              description: s.stepDesc,
//            });
//          });
//        const picked = await vscode.window.showQuickPick(
//          stepItems,
//          <vscode.QuickPickOptions>{
//            canPickMany: false,
//            placeHolder: "Select the zig target to run",
//          },
//        );
//        if (!picked) { return null; }
//        this.cachedPick = picked.step;
//      }
//      return this.cachedPick;
//    }
//  }
//
// class ZigBuildTerminal implements vscode.Pseudoterminal {
//   private writeEmitter = new vscode.EventEmitter<string>();
//   private closeEmitter = new vscode.EventEmitter<number>();
//   onDidWrite: vscode.Event<string> = this.writeEmitter.event;
//   onDidClose: vscode.Event<number> = this.closeEmitter.event;
//   private buildProc?: cp.ProcessRun | undefined;
//
//   constructor(
//     private readonly shellCmd: string,
//     private readonly shellArgs?: string[],              // Any arguments
//     private readonly cwd?: string,              // Current working directory
//   ) { }
//
//   // At this point we can start using the terminal.
//   async open(_initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
//     try {
//       // Do build.
//       const processRun = cp.runProcess(
//         this.shellCmd,
//         <cp.ProcessRunOptions>{
//           shellArgs: this.shellArgs,
//           cwd: this.cwd,
//           logger: ZigExt.logger,
//           onStart: () => this.emitLine("Starting build..."),
//           onStdout: (str) => this.splitWriteEmitter(str),
//           onStderr: (str) => this.splitWriteEmitter(str),
//         }
//       );
//       // Emit Resolved command
//       this.emitLine(processRun.procCmd);
//       this.buildProc = processRun;
//       const { stdout, stderr } = await processRun.completion;
//
//       // printBuildSummary
//       const hasStdOut = types.isNonBlank(stdout);
//       const hasStdErr = types.isNonBlank(stderr);
//       if (
//         (!hasStdOut && hasStdErr && stderr.includes("error"))
//         || (hasStdOut && stdout.includes("error"))
//       ) {
//         this.emitLine("Build finished with error(s)");
//       } else if (
//         (!hasStdOut && hasStdErr && stderr.includes("warning"))
//         || (hasStdOut && stdout.includes("warning"))
//       ) {
//         this.emitLine("Build finished with warning(s)");
//       } else {
//         this.emitLine("Build finished successfully");
//       }
//       this.buildProc = undefined;
//       this.closeEmitter.fire(0);
//     }
//     catch (err) {
//       this.buildProc = undefined;
//       this.emitLine("Build run was terminated");
//       const stdout = (err as cp.ProcRunException)?.stdout;
//       const stderr = (err as cp.ProcRunException)?.stderr;
//       if (err) { this.splitWriteEmitter(String(err)); }
//       if (stdout) { this.splitWriteEmitter(stdout); }
//       if (stderr) { this.splitWriteEmitter(stderr); }
//       this.closeEmitter.fire(-1);
//     }
//   }
//
//   // The terminal has been closed. Shutdown the build.
//   close(): void {
//     if (!this.buildProc || !this.buildProc.isRunning()) { return; }
//     this.buildProc.kill();
//     this.buildProc = undefined;
//     this.emitLine("Build run was cancelled");
//   }
//
//   private emitLine(text: string) {
//     this.writeEmitter.fire(text);
//     this.writeEmitter.fire(ext.crlfString);
//   }
//   private splitWriteEmitter(lines: string | Buffer) {
//     const splitLines: string[] = lines.toString().split(ext.eolRegEx);
//     for (let i = 0; i < splitLines.length; i++) {
//       let line = splitLines[i];
//       // We may not get full lines, only output an eol when a full line is detected
//       if (i !== splitLines.length - 1) { line += ext.crlfString; }
//       this.writeEmitter.fire(line);
//     }
//   }
// }