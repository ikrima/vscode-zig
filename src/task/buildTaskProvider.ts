'use strict';
import * as vscode from "vscode";
import { CmdConst, ExtConst } from "../zigConst";
import { ZigExt } from "../zigContext";
import { cp, types, fs } from '../utils';

import ZigBuildTask = vscode.Task;

enum StepGroup {
  run = 0,
  test,
  build,
  tool,
  none,
}
namespace StepGroup {
  export function toIcon(group: StepGroup): string {
    switch (group) {
      case StepGroup.run:   return "$(play)";
      case StepGroup.test:  return "$(beaker)";
      case StepGroup.build: return "$(package)";
      case StepGroup.tool:  return "$(tools)";
      case StepGroup.none:  return "";
    }
  }
  export function fromDesc(desc: string): StepGroup {
    return desc.startsWith("Run:")   ? StepGroup.run
         : desc.startsWith("Test")   ? StepGroup.test
         : desc.startsWith("Build:") ? StepGroup.build
         : desc.startsWith("Tool:")  ? StepGroup.tool
         :                             StepGroup.none;
  }
}
type ZigBldStep = {
  name:    string;
  desc:    string;
  group:   StepGroup;
  default: boolean;
};
const stepsRegEx = /\s+(?<name>\S+)\s(?<dflt>\(default\))?\s*(?<desc>[^\n]+)\n?/g;

async function rawGetBuildSteps(): Promise<ZigBldStep[]> {
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
      {
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
      ([_, name, dflt, desc]: RegExpMatchArray): ZigBldStep => ({
        name:    name,
        desc:    desc,
        group:   StepGroup.fromDesc(desc),
        default: !!dflt,
      })
    );
  }
  catch (e) {
    ZigExt.logger.error('zig build errors', e);
    return Promise.reject();
  }
}

async function rawPickBuildStep(bldSteps: Promise<ZigBldStep[]>): Promise<string | undefined> {
  type StepPickItem = { step: ZigBldStep } & vscode.QuickPickItem;
  const stepItems = bldSteps.then(steps => {
    return steps
      .sort((a, b) => a.group - b.group)
      .map<StepPickItem>(s => ({
        step: s,
        label: `${StepGroup.toIcon(s.group)} ${s.name}`,
        description: s.desc,
      }));
  });
  const picked = await vscode.window.showQuickPick(
    stepItems,
    {
      placeHolder: "Select the zig target to run",
      canPickMany: false,
      matchOnDescription: true,
    },
  );
  return picked?.step.name;
}

interface ZigBuildTaskDefinition extends vscode.TaskDefinition {
  label: string;
  stepName: string;
  buildFile?: string;
  args?: string[];
  cwd?: string;
}

class ZigBuildTaskProvider implements vscode.TaskProvider {
  private _cachedBldSteps: ZigBldStep[] | undefined = undefined;
  private _cachedBldTasks: ZigBuildTask[] | undefined = undefined;
  private _cachedPickedStep: string | undefined = undefined;
  private fileWatcher: vscode.FileSystemWatcher | undefined = undefined;
  private registrations: vscode.Disposable[] = [];

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
      vscode.commands.registerCommand(CmdConst.zig.build.runStep, async (stepName: string) => {
        await this.runBuildStep(stepName);
      }),
      vscode.commands.registerCommand(CmdConst.zig.build.lastTarget, async (args?: { forcePick: boolean }) => {
        const pickedStep = await this.cachedPickedStep(args?.forcePick);
        if (!pickedStep) { return; }
        await this.runBuildStep(pickedStep);
      }),
      vscode.commands.registerCommand(CmdConst.zig.build.getLastTarget, async (args?: { forcePick: boolean }) => {
        const pickedStep = await this.cachedPickedStep(args?.forcePick);
        return pickedStep ? pickedStep : Promise.reject("cancelled");
      }),
      vscode.tasks.registerTaskProvider(ExtConst.buildTaskType, this),
    );

    // const zigFormatStatusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem("zig.statusBar", vscode.StatusBarAlignment.Left);
    // zigFormatStatusBar.name = "zig build";
    // zigFormatStatusBar.text = "$(wrench) zig build workspace";
    // zigFormatStatusBar.tooltip = "zig build workspace";
    // zigFormatStatusBar.command = "zig.runBuildStep";
    // zigFormatStatusBar.show();
  }
  public async provideTasks(): Promise<ZigBuildTask[]> {
    const tasks = await this.cachedBuildTasks();
    return tasks;
  }
  // Resolves a task that has no [`execution`](#Task.execution) set.
  public resolveTask(task: ZigBuildTask): ZigBuildTask | undefined {
    if (task.definition['stepName']) {
      return !task.execution
        ? this.makeZigTask(task.definition as ZigBuildTaskDefinition)
        : task;
    }
    return undefined;
  }

  private invalidateTasksCache(): void {
    this._cachedBldSteps = undefined;
    this._cachedBldTasks = undefined;
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
          .map(s => this.makeZigTask({ type: ExtConst.buildTaskType, label: s.name, stepName: s.name }));
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
    const bldTask = this.makeZigTask({ type: ExtConst.buildTaskType, label: stepName, stepName: stepName });
    await vscode.tasks.executeTask(bldTask);
  }
  private makeZigTask(taskDef: ZigBuildTaskDefinition): ZigBuildTask {
    const zig = ZigExt.zigCfg.zig;
    const resolvedTaskArgs = {
      cmdArgs: [
        taskDef.stepName,
        ...[`--build-file`, taskDef.buildFile ?? zig.buildFile],
        ...(taskDef.args ?? [])
      ],
      cwd: taskDef.cwd ?? zig.buildRootDir,
    };
    const task = new ZigBuildTask(
      taskDef,
      vscode.TaskScope.Workspace,
      taskDef.label,
      ExtConst.taskProviderSourceStr,
      new vscode.ShellExecution(
        zig.binary,
        [
          "build",
          ...resolvedTaskArgs.cmdArgs,
        ],
        { cwd: resolvedTaskArgs.cwd },
      ),
      zig.enableTaskProblemMatcher ? ExtConst.problemMatcher : undefined,
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
export function createBuildTaskProvider(): vscode.Disposable {
  const zigBuildTaskProvider = new ZigBuildTaskProvider();
  zigBuildTaskProvider.register();
  return zigBuildTaskProvider;
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
//            {
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
//            return steps.map(s => {
//              step: s,
//              label: s.stepName,
//              description: s.stepDesc,
//            });
//          });
//        const picked = await vscode.window.showQuickPick(
//          stepItems,
//          {
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
//         {
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
//     catch (e) {
//       this.buildProc = undefined;
//       this.emitLine("Build run was terminated");
//       const stdout = (e as cp.ProcRunException)?.stdout;
//       const stderr = (e as cp.ProcRunException)?.stderr;
//       if (e) { this.splitWriteEmitter(String(e)); }
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