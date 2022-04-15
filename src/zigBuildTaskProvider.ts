'use strict';
import * as vscode from "vscode";
import { CmdConst, ExtConst } from "./zigConst";
import { zigContext } from "./zigContext";
import { cp, types, fs } from './utils';
import type { ExecFileOptionsWithStringEncoding } from 'child_process';


type ZigBldStep = {
  kind: 'zigBldStep';
  stepName: string;
  stepDesc: string;
  isDefault: boolean;
};
const stepsRegEx = /\s+(?<step>\S+)\s(?<dflt>\(default\))?\s*(?<desc>[^\n]+)\n?/g;

class ZigBuild {
  private cachedSteps: ZigBldStep[] | null = null;
  private cachedPick: ZigBldStep | null = null;

  public async getBuildSteps(forceReload: boolean): Promise<ZigBldStep[]> {
    if (forceReload || !this.cachedSteps) {
      const zig = zigContext.zigCfg.zig;
      if (!await fs.fileExists(zig.buildFile)) {
        zigContext.logger.error("Aborting build target fetch. No build.zig file found in workspace root.");
        return Promise.reject<ZigBldStep[]>();
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
          zigContext.logger.error(`zig build errors\n${stderr}`);
          return Promise.reject();
        }
        const stepsIdx = stdout.indexOf("Steps:");
        const genOpIdx = stdout.indexOf("General Options:", stepsIdx);
        const stepsStr = stdout.substring(stepsIdx, genOpIdx);
        this.cachedSteps = Array.from(
          stepsStr.matchAll(stepsRegEx),
          (m: RegExpMatchArray, _): ZigBldStep => {
            return {
              kind: 'zigBldStep',
              stepName: m[1],
              stepDesc: m[3],
              isDefault: !types.isNullOrUndefined(m[2])
            };
          },
        );

      }
      catch (e) {
        zigContext.logger.error('zig build errors', e);
        return Promise.reject();
      }

    }
    return this.cachedSteps;
  }

  public async pickBuildStep(forcePick: boolean): Promise<ZigBldStep | null> {
    if (forcePick || !this.cachedPick) {
      type StepPickItem = { step: ZigBldStep } & vscode.QuickPickItem;
      // const steps = await this.getBuildSteps(forcePick);
      // const stepItems = Array.from(steps, (s): StepPickItem => {
      //   return {
      //     step: s,
      //     label: s.stepName,
      //     description: s.stepDesc,
      //   };
      // });
      const stepItems = this
        .getBuildSteps(false)
        .then(steps => {
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
      if (!picked) { return null; }
      this.cachedPick = picked.step;
    }
    return this.cachedPick;
  }

}

interface ZigBuildTaskDefinition extends vscode.TaskDefinition {
  stepName: string;
  buildFile?: string;
  args?: string[];
  cwd?: string;
}
class ZigBuildTask extends vscode.Task { }

export class ZigBuildTaskProvider implements vscode.TaskProvider {
  private zigBuild: ZigBuild = new ZigBuild();
  private bldTasks: ZigBuildTask[] | null = null;
  private lastBuildTask: ZigBuildTask | null = null;
  private fileWatcher: vscode.FileSystemWatcher;
  private registrations: vscode.Disposable[] = [];
  constructor(buildFile: string) {
    this.registrations.push(
      vscode.commands.registerCommand(CmdConst.zig.pickBuildStep, async (forcePick?: boolean) => {
        const bldStep = await this.zigBuild.pickBuildStep(forcePick ?? false);
        return bldStep?.stepName;
      }),
      vscode.commands.registerCommand(CmdConst.zig.buildExplicit, async () => {
        const step = await this.zigBuild.pickBuildStep(true);
        if (!step) { return; }
        const bldTask = this.makeZigTask({ type: ExtConst.buildTaskType, stepName: step.stepName });
        this.lastBuildTask = bldTask;
        await vscode.tasks.executeTask(bldTask);
      }),
      vscode.commands.registerCommand(CmdConst.zig.buildLastTarget, async () => {
        if (this.lastBuildTask) {
          await vscode.tasks.executeTask(this.lastBuildTask);
        }
        else {
          const step = await this.zigBuild.pickBuildStep(true);
          if (!step) { return; }
          const bldTask = this.makeZigTask({ type: ExtConst.buildTaskType, stepName: step.stepName });
          this.lastBuildTask = bldTask;
          await vscode.tasks.executeTask(bldTask);
        }
      }),
    );

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(buildFile);
    this.fileWatcher.onDidChange(() => this.onBuildFileChange());
    this.fileWatcher.onDidCreate(() => this.onBuildFileChange());
    this.fileWatcher.onDidDelete(() => this.onBuildFileChange());

    // const zigFormatStatusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem("zig.statusBar", vscode.StatusBarAlignment.Left);
    // zigFormatStatusBar.name = "zig build";
    // zigFormatStatusBar.text = "$(wrench) zig build workspace";
    // zigFormatStatusBar.tooltip = "zig build workspace";
    // zigFormatStatusBar.command = "zig.buildExplicit";
    // zigFormatStatusBar.show();
  }
  dispose(): void {
    this.registrations.forEach(d => void d.dispose());
    this.registrations = [];
    this.fileWatcher.dispose();
  }
  private onBuildFileChange(): void {
    this.bldTasks = null;
    this.lastBuildTask = null;
  }

  public async provideTasks(_token: vscode.CancellationToken): Promise<ZigBuildTask[]> {
    if (!this.bldTasks) {
      const steps = await this.zigBuild.getBuildSteps(true);
      this.bldTasks = steps.map(s => this.makeZigTask({ type: ExtConst.buildTaskType, stepName: s.stepName }));
    }
    return this.bldTasks;
  }
  // Resolves a task that has no [`execution`](#Task.execution) set.
  public resolveTask(task: ZigBuildTask, _token: vscode.CancellationToken): ZigBuildTask | undefined {
    const execution = task.execution;
    if (!execution) {
      const taskDef: ZigBuildTaskDefinition = task.definition as ZigBuildTaskDefinition;
      task = this.makeZigTask(taskDef);
    }
    return task;
  }

  private makeZigTask(taskDef: ZigBuildTaskDefinition): ZigBuildTask {
    const zig = zigContext.zigCfg.zig;
    taskDef.args = taskDef.args ?? [];
    taskDef.cwd = taskDef.cwd ?? zig.buildRootDir;
    taskDef.buildFile = taskDef.buildFile ?? zig.buildFile;

    const task = new ZigBuildTask(
      taskDef,
      vscode.TaskScope.Workspace,
      `zig build ${taskDef.stepName}`,
      ExtConst.taskProviderSourceStr,
      new vscode.ShellExecution(
        zig.binary,
        [
          "build",
          taskDef.stepName,
          ...[`--build-file`, zig.buildFile],
          ...(taskDef.args)
        ],
        <vscode.ShellExecutionOptions>{
          cwd: taskDef.cwd,
        }
      ),
      ExtConst.problemMatcher
    );
    const stepNameLower = taskDef.stepName.toLowerCase();
    if (stepNameLower.includes("build")) { task.group = vscode.TaskGroup.Build; }
    else if (stepNameLower.includes("test")) { task.group = vscode.TaskGroup.Test; }
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