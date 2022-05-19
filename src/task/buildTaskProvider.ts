'use strict';
import * as vsc from 'vscode';
import { CmdId, Const } from "../zigConst";
import { zig_logger, zig_cfg } from "../zigExt";
import { DisposableStore } from '../utils/dispose';
import { ZigBldStep, rawGetBuildSteps, rawPickBuildStep } from "./zigStep";
import ZigBuildTask = vsc.Task;

interface ZigBuildTaskDefinition extends vsc.TaskDefinition {
  label: string;
  stepName: string;
  buildFile?: string;
  args?: string[];
  cwd?: string;
}

export class ZigBuildTaskProvider extends DisposableStore implements vsc.TaskProvider {
  private _cachedBldSteps: ZigBldStep[] | undefined = undefined;
  private _cachedBldTasks: ZigBuildTask[] | undefined = undefined;
  private _cachedPickedStep: string | undefined = undefined;

  public activate(): void {
    const fileWatcher = this.addDisposable(vsc.workspace.createFileSystemWatcher(zig_cfg.zig.buildFile));

    this.addDisposables(
      vsc.tasks.registerTaskProvider(Const.buildTaskType, this),
      fileWatcher.onDidChange(() => this.invalidateTasksCache()),
      fileWatcher.onDidCreate(() => this.invalidateTasksCache()),
      fileWatcher.onDidDelete(() => this.invalidateTasksCache()),
      vsc.commands.registerCommand(CmdId.zig.build.runStep, async (stepName: string) => {
        await this.runBuildStep(stepName);
      }),
      vsc.commands.registerCommand(CmdId.zig.build.lastTarget, async (args?: { forcePick: boolean }) => {
        const pickedStep = await this.cachedPickedStep(args?.forcePick);
        if (!pickedStep) { return; }
        await this.runBuildStep(pickedStep);
      }),
      vsc.commands.registerCommand(CmdId.zig.build.getLastTarget, async (args?: { forcePick: boolean }) => {
        const pickedStep = await this.cachedPickedStep(args?.forcePick);
        return pickedStep ? pickedStep : Promise.reject("cancelled");
      }),
    );

    // const zigFormatStatusBar: vsc.StatusBarItem = vsc.window.createStatusBarItem("zig.statusBar", vsc.StatusBarAlignment.Left);
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
      zig_logger.error('zig build errors', e);
      return Promise.reject();
    }
  }

  private async cachedBuildTasks(force?: boolean): Promise<ZigBuildTask[]> {
    try {
      if (force || !this._cachedBldTasks) {
        this._cachedBldTasks = (await this.cachedBuildSteps())
          .map(s => this.makeZigTask({ type: Const.buildTaskType, label: s.name, stepName: s.name }));
      }
      return this._cachedBldTasks;
    }
    catch (e) {
      this._cachedBldTasks = undefined;
      zig_logger.error('zig build errors', e);
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
    const bldTask = this.makeZigTask({ type: Const.buildTaskType, label: stepName, stepName: stepName });
    await vsc.tasks.executeTask(bldTask);
  }
  private makeZigTask(taskDef: ZigBuildTaskDefinition): ZigBuildTask {
    const zig = zig_cfg.zig;
    const task = new ZigBuildTask(
      taskDef,
      vsc.TaskScope.Workspace,
      taskDef.label,
      Const.taskProviderSourceStr,
      new vsc.ShellExecution(
        zig.binary, // isWindows ? `cmd /c chcp 65001>nul && ${zig.binary}` : zig.binary,
        [
          "build",
          taskDef.stepName,
          ...[`--build-file`, taskDef.buildFile ?? zig.buildFile],
          ...(taskDef.args ?? [])
        ],
        { cwd: taskDef.cwd ?? zig.buildRootDir },
      ),
      zig.enableTaskProblemMatcher ? Const.problemMatcher : undefined,
    );
    const stepNameLower = taskDef.stepName.toLowerCase();
    if (stepNameLower.includes("build")) { task.group = vsc.TaskGroup.Build; }
    else if (stepNameLower.includes("test")) { task.group = vsc.TaskGroup.Test; }
    task.detail = `zig build ${taskDef.stepName}`;
    task.presentationOptions = {
      reveal: vsc.TaskRevealKind.Always,
      echo: true,
      focus: false,
      panel: vsc.TaskPanelKind.Shared,
      showReuseMessage: false,
      clear: true,
    };
    return task;
  }
}
