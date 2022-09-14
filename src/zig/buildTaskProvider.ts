'use strict';
import * as vsc from 'vscode';
import { ZIG } from '../constants';
import { DisposableBase } from '../utils/dispose';
import { ScopedError } from '../utils/logging';
import { mixin } from '../utils/objects';
import { TaskInstance } from '../utils/vsc';
import { extCfg } from '../zigExt';
import { rawGetBuildSteps, rawPickBuildStep, ZigBldStep } from './zigStep';
import ZigBuildTask = vsc.Task;

interface ZigBuildTaskDefinition extends vsc.TaskDefinition {
  stepName: string;
  label?: string;
  buildFile?: string;
  args?: string[];
  cwd?: string;
  presentation?: vsc.TaskPresentationOptions | undefined;
}
type RunStepCmdArgs = {
  stepName: string;
  presentation?: vsc.TaskPresentationOptions;
};
type GetLastTargetCmdArgs = { forcePick: boolean };
type LastTargetCmdArgs = {
  forcePick?: boolean;
  presentation?: vsc.TaskPresentationOptions;
};
export default class ZigBuildTaskProvider extends DisposableBase implements vsc.TaskProvider {
  private _cachedBldSteps: ZigBldStep[] | undefined = undefined;
  private _cachedBldTasks: ZigBuildTask[] | undefined = undefined;
  private _cachedPickedStep: string | undefined = undefined;

  constructor() {
    super();
    const fileWatcher = this.addDisposable(vsc.workspace.createFileSystemWatcher(extCfg.zig.buildFile));

    this.addDisposables(
      vsc.tasks.registerTaskProvider(ZIG.buildTaskType, this),
      fileWatcher.onDidChange(() => this.invalidateTasksCache()),
      fileWatcher.onDidCreate(() => this.invalidateTasksCache()),
      fileWatcher.onDidDelete(() => this.invalidateTasksCache()),
      vsc.commands.registerCommand(ZIG.CmdId.build.runStep, async (args: RunStepCmdArgs) => {
        await this.runBuildStep({
          type: ZIG.buildTaskType,
          stepName: args.stepName,
          presentation: args.presentation,
        });
      }),
      vsc.commands.registerCommand(ZIG.CmdId.build.runLastTarget, async (args: LastTargetCmdArgs) => {
        const pickedStep = await this.cachedPickedStep(args.forcePick);
        if (!pickedStep) { return; }
        await this.runBuildStep({
          type: ZIG.buildTaskType,
          stepName: pickedStep,
          label: `zig-lastTarget`,
          presentation: args.presentation,
        });
      }),
      vsc.commands.registerCommand(ZIG.CmdId.build.getLastTarget, async (args?: GetLastTargetCmdArgs) => {
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
    const tasks: ZigBuildTask[] = await this.cachedBuildTasks().catch(e => {
      extCfg.mainLog.logMsg(ScopedError.wrap(e));
      return [];
    });
    return tasks;
  }
  // Resolves a task that has no [`execution`](#Task.execution) set.
  public resolveTask(task: ZigBuildTask): ZigBuildTask | undefined {
    const definition = task.definition as ZigBuildTaskDefinition;
    if (!definition.stepName
      || task.scope === undefined
      || task.scope === vsc.TaskScope.Global) {
      return undefined;
    }
    return !task.execution
      ? this.getBuildTask(definition, task.scope)
      : task;
  }

  private invalidateTasksCache(): void {
    this._cachedBldSteps = undefined;
    this._cachedBldTasks = undefined;
    this._cachedPickedStep = undefined;
  }

  private async cachedBuildSteps(force?: boolean): Promise<ZigBldStep[]> {
    try {
      if (force || !this._cachedBldSteps) { this._cachedBldSteps = await rawGetBuildSteps(); }
      return this._cachedBldSteps;
    }
    catch (e) {
      this._cachedBldSteps = undefined;
      return Promise.reject(e);
    }
  }

  private async cachedBuildTasks(force?: boolean): Promise<ZigBuildTask[]> {
    try {
      if (force || !this._cachedBldTasks) {
        this._cachedBldTasks = (await this.cachedBuildSteps())
          .map(s => this.getBuildTask({ type: ZIG.buildTaskType, stepName: s.name }, vsc.TaskScope.Workspace));
      }
      return this._cachedBldTasks;
    }
    catch (e) {
      this._cachedBldTasks = undefined;
      return Promise.reject(e);
    }
  }

  private async cachedPickedStep(forcePick?: boolean): Promise<string | undefined> {
    const pickedStep = (forcePick || !this._cachedPickedStep)
      ? await rawPickBuildStep(this.cachedBuildSteps())
      : this._cachedPickedStep;
    if (pickedStep) { this._cachedPickedStep = pickedStep; }
    return pickedStep;
  }

  private async runBuildStep(taskDef: ZigBuildTaskDefinition): Promise<void> {
    const zigTask = this.getBuildTask(taskDef, vsc.TaskScope.Workspace);
    await TaskInstance.launch(zigTask).catch((e?: unknown) => {
      return Promise.reject(
        ScopedError.make(`zig build for ${zigTask.name} failed`, e)
      );
    });
  }

  private getBuildTask(taskDef: ZigBuildTaskDefinition, workspaceFolder: vsc.WorkspaceFolder | vsc.TaskScope.Workspace): ZigBuildTask {
    const zig = extCfg.zig;
    const is_build_step = /build/i.test(taskDef.stepName);
    const is_test_step  = !is_build_step && /test/i.test(taskDef.stepName);
    const task = new ZigBuildTask(
      taskDef,
      workspaceFolder,
      taskDef.label ?? `zig-${taskDef.stepName}`,
      ZIG.taskProviderSourceStr,
      new vsc.ShellExecution(
        zig.binary, // process.isWindows ? `cmd /c chcp 65001>nul && ${zig.binary}` : zig.binary,
        [
          "build",
          taskDef.stepName,
          ...[`--build-file`, taskDef.buildFile ?? zig.buildFile],
          ...(taskDef.args ?? []),
          ...(is_test_step ? ["2>&1|", "cat"] : []), //TODO: ikrimae: #zig-workaround: for test runner swallowing output [https://github.com/ziglang/zig/issues/10203]
        ],
        { cwd: taskDef.cwd ?? zig.buildRootDir },
      ),
      zig.enableTaskProblemMatcher ? ZIG.problemMatcher : undefined,
    );
    if      (is_build_step) { task.group = vsc.TaskGroup.Build; }
    else if (is_test_step)  { task.group = vsc.TaskGroup.Test;  }
    task.detail = `zig build ${taskDef.stepName}`;
    task.presentationOptions = {
      reveal: vsc.TaskRevealKind.Always,
      echo: true,
      focus: false,
      panel: vsc.TaskPanelKind.Dedicated,
      showReuseMessage: false,
      clear: true,
    };
    mixin(task.presentationOptions, taskDef.presentation ?? {}, true);

    return task;
  }
}
