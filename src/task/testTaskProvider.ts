'use strict';
import * as vsc from 'vscode';
import { fs, objects, path } from '../utils/common';
import { Debugger, launchLLDB, launchVsDbg } from '../utils/debugger';
import { ScopedError } from '../utils/logging';
import { DisposableStore } from '../utils/dispose';
import { TaskInstance, VariableResolver } from '../utils/vsc';
import { CmdId, Const } from "../zigConst";
import { zigCfg } from "../zigExt";
import type { ZigTestStep } from "./zigStep";
import ZigTestTask = vsc.Task;

interface ZigTestTaskDefinition extends vsc.TaskDefinition {
  label: string;
  buildArgs: {
    testSrcFile: string;
    mainPkgPath?: string | undefined;
  };
  runArgs?: {
    debugLaunch?: boolean | undefined;
    testFilter?: string | undefined;
    cwd?: string | undefined;
  };
  presentation?: vsc.TaskPresentationOptions;
}
type RunTestCmdArgs = ZigTestStep;

export class ZigTestTaskProvider extends DisposableStore implements vsc.TaskProvider {
  public activate(): void {
    this.addDisposables(
      vsc.tasks.registerTaskProvider(Const.zig.testTaskType, this),
      vsc.commands.registerCommand(CmdId.zig.runTest, async (args: RunTestCmdArgs) => {
        args.label = args.label ?? `test-${path.filename(args.buildArgs.testSrcFile)}`;
        args.buildArgs.mainPkgPath = args.buildArgs.mainPkgPath ?? path.dirname(args.buildArgs.testSrcFile);
        const taskDef: ZigTestTaskDefinition = {
          type: Const.zig.testTaskType,
          label: args.label,
          buildArgs: {
            testSrcFile: args.buildArgs.testSrcFile,
            mainPkgPath: args.buildArgs.mainPkgPath,
          },
          runArgs: {
            debugLaunch: args.runArgs.debugLaunch,
            testFilter: args.runArgs.testFilter,
            cwd: args.runArgs.cwd,
          },
        };
        const zigTask = this.getTestTask(taskDef, vsc.TaskScope.Workspace);
        await this.runTestTask(zigTask).catch(e => {
          zigCfg.mainLog.logMsg(ScopedError.wrap(e));
        });
      }),
    );
  }

  public provideTasks(): ZigTestTask[] {
    return [];
  }

  public resolveTask(task: ZigTestTask): ZigTestTask | undefined {
    const definition = task.definition as ZigTestTaskDefinition;
    if (!definition.buildArgs.testSrcFile
      || task.scope === undefined
      || task.scope === vsc.TaskScope.Global) {
      return undefined;
    }
    return !task.execution
      ? this.getTestTask(definition, task.scope)
      : task;
  }

  private async runTestTask(zigTask: ZigTestTask): Promise<void> {
    const taskDef = zigTask.definition as ZigTestTaskDefinition;
    const zig = zigCfg.zig;
    const outBinDir = path.join(zig.buildOutDir, "bin");
    try { if (!(await fs.dirExists(outBinDir))) { await fs.createDir(outBinDir); } } catch (e) {
      return Promise.reject(
        ScopedError.make(`Could not create testEmitBinDir: (${outBinDir}) does not exists.`, e)
      );
    }
    // Run Build Task
    try {
      const { on_task_start } = await TaskInstance.launch(zigTask);
      await on_task_start;
      if (!taskDef.runArgs?.debugLaunch) { return; }
    }
    catch (e) {
      return Promise.reject(e);
    }

    try {
      if (Debugger.isActive(Debugger.vsdbg)) {
        await launchVsDbg({
          name: `Zig Test Debug`,
          program: path.join(outBinDir, `${taskDef.label}.exe`),
          args: [zig.binary],
          cwd: taskDef.runArgs?.cwd,
          console: 'integratedTerminal'
        });
      }
      else if (Debugger.isActive(Debugger.lldb)) {
        await launchLLDB({
          name: `Zig Test Debug`,
          program: path.join(outBinDir, `${taskDef.label}.exe`),
          args: [zig.binary],
          cwd: taskDef.runArgs?.cwd,
          console: 'integratedTerminal'
        });
      }
      else {
        return Promise.reject(ScopedError.make("cpptools/vscode-lldb extension must be enabled or installed."));
      }
    }
    catch (e) {
      return Promise.reject(e);
    }
  }

  private getTestTask(taskDef: ZigTestTaskDefinition, workspaceFolder: vsc.WorkspaceFolder | vsc.TaskScope.Workspace | undefined): ZigTestTask {
    const zig = zigCfg.zig;
    const outBinDir = path.join(zig.buildOutDir, "bin");
    const varCtx = new VariableResolver();
    const task = new ZigTestTask(
      taskDef,
      workspaceFolder ?? vsc.TaskScope.Workspace,
      taskDef.label,
      Const.zig.taskProviderSourceStr,
      new vsc.ShellExecution(
        zig.binary, // isWindows ? `cmd /c chcp 65001>nul && ${zig.binary}` : zig.binary,
        [
          "test",
          taskDef.buildArgs.testSrcFile,
          ...(taskDef.buildArgs.mainPkgPath ? ["--main-pkg-path", taskDef.buildArgs.mainPkgPath] : []),
          `-femit-bin=` + path.join(outBinDir, `${taskDef.label}.exe`),
          ...(taskDef.runArgs?.testFilter ? ["--test-filter", taskDef.runArgs.testFilter] : []),
          ...(taskDef.runArgs?.debugLaunch ? [`--test-no-exec`] : []),
          "--name", taskDef.label,
          "--enable-cache",
          "--cache-dir", zig.buildCacheDir,
        ].map(arg => varCtx.resolveVars(arg)),
        { cwd: zig.buildRootDir },
      ),
      zig.enableTaskProblemMatcher ? Const.zig.problemMatcher : undefined,
    );
    task.group = vsc.TaskGroup.Test;
    task.detail = `zig test ${taskDef.label}`;
    task.presentationOptions = {
      reveal: vsc.TaskRevealKind.Always,
      echo: true,
      focus: false,
      panel: vsc.TaskPanelKind.Dedicated,
      showReuseMessage: false,
      clear: true,
    };
    objects.mixin(task.presentationOptions, taskDef.presentation ?? {}, true);
    return task;
  }
}
