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
  private cachedSteps: ZigBldStep[] | undefined;
  private cachedPick: ZigBldStep | undefined;

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
type ZigBuildTaskResolved = Required<ZigBuildTaskDefinition>;
class ZigBuildTask extends vscode.Task { }

export class ZigBuildTaskProvider implements vscode.TaskProvider, vscode.Disposable {
  private zigBuild: ZigBuild = new ZigBuild();
  private bldTasksPromise: Promise<ZigBuildTask[]> | undefined;
  private lastBuildTask: ZigBuildTask | undefined;
  private fileWatcher: vscode.FileSystemWatcher;
  private registrations: vscode.Disposable[] = [];
  constructor(buildFile: string) {
    this.registrations.push(
      vscode.commands.registerCommand(CmdConst.zig.pickBuildStep, async (forcePick?: boolean) => {
        const bldStep = await this.zigBuild.pickBuildStep(forcePick ?? false);
        return bldStep?.stepName;
      }),
      vscode.commands.registerCommand(CmdConst.zig.buildLastTarget, async () => {
        if (this.lastBuildTask) {
          // await vscode.commands.executeCommand('workbench.action.terminal.clear');
          await this.runBuildTask(this.lastBuildTask, false);
        }
      }),
      vscode.commands.registerCommand(CmdConst.zig.build, async () => {
        const step = await this.zigBuild.pickBuildStep(true);
        if (!step) { return; }
        const bldTask = this.makeZigTask({ type: ExtConst.buildTaskType, stepName: step.stepName });
        await this.runBuildTask(bldTask, true);
      }),
    );

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(buildFile);
    this.fileWatcher.onDidChange(() => this.onBuildFileChange());
    this.fileWatcher.onDidCreate(() => this.onBuildFileChange());
    this.fileWatcher.onDidDelete(() => this.onBuildFileChange());
  }
  dispose(): void {
    this.registrations.forEach(d => void d.dispose());
    this.registrations = [];
    this.fileWatcher.dispose();
  }
  private onBuildFileChange(): void {
    this.bldTasksPromise = undefined;
    this.lastBuildTask = undefined;
  }

  public async provideTasks(_token: vscode.CancellationToken): Promise<ZigBuildTask[]> {
    if (!this.bldTasksPromise) {
      this.bldTasksPromise = this.zigBuild
        .getBuildSteps(true)
        .catch(e => { zigContext.logger.warn("Could not provide zig build tasks", e); return []; })
        .then(steps => steps.map(s => this.makeZigTask({ type: ExtConst.buildTaskType, stepName: s.stepName })));
    }
    return this.bldTasksPromise;
  }
  // Resolves a task that has no [`execution`](#Task.execution) set.
  public resolveTask(task: ZigBuildTask, _token: vscode.CancellationToken): ZigBuildTask | undefined {
    const execution: vscode.ProcessExecution | vscode.ShellExecution | vscode.CustomExecution | undefined = task.execution;
    if (!execution && task.definition.type === ExtConst.buildTaskType) {
      task = this.makeZigTask(task.definition as ZigBuildTaskDefinition);
      return task;
    }
    return undefined;

  }

  private makeZigTask(taskDef: ZigBuildTaskDefinition): ZigBuildTask {
    const zig = zigContext.zigCfg.zig;
    const resolvedDef: ZigBuildTaskResolved = {
      type: ExtConst.buildTaskType,
      stepName: taskDef.stepName,
      args: taskDef.args ?? [],
      cwd: taskDef.cwd ?? zig.buildRootDir,
      buildFile: taskDef.buildFile ?? zig.buildFile,
    };

    const task = new ZigBuildTask(
      resolvedDef,
      vscode.TaskScope.Workspace,
      `zig build ${resolvedDef.stepName}`,
      ExtConst.taskProviderSourceStr,
      new vscode.ShellExecution(
        zig.binary,
        [
          "build",
          resolvedDef.stepName,
          ...[`--build-file`, zig.buildFile],
          ...(resolvedDef.args)
        ],
        <vscode.ShellExecutionOptions>{
          cwd: resolvedDef.cwd,
        }
      ),
      ExtConst.problemMatcher
    );
    const stepNameLower = resolvedDef.stepName.toLowerCase();
    if      (stepNameLower.includes("build")) { task.group = vscode.TaskGroup.Build; }
    else if (stepNameLower.includes("test" )) { task.group = vscode.TaskGroup.Test;  }
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Silent,
      echo: true,
      showReuseMessage: false,
      clear: true,
    };
    return task;
  }
  private async runBuildTask(zigTask: ZigBuildTask, updateLastRun: boolean): Promise<void> {
    if (updateLastRun) {
      this.lastBuildTask = zigTask;
      void vscode.commands.executeCommand("setContext", "zig.hasLastRanTask", true);
    }
    await vscode.tasks.executeTask(zigTask);
  }
}