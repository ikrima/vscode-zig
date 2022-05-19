'use strict';
import * as vsc from 'vscode';
import { fs, path } from '../utils/common';
import { VariableResolver, onceEvent } from '../utils/ext';
import { Debugger, launchVsDbg, launchLLDB } from '../utils/debugger';
import { DisposableStore } from '../utils/dispose';
import { CmdId, Const } from "../zigConst";
import { zig_logger, zig_cfg } from "../zigExt";
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
}
export class ZigTestTaskProvider extends DisposableStore implements vsc.TaskProvider {
  public activate(): void {
    this.addDisposables(
      vsc.tasks.registerTaskProvider(Const.testTaskType, this),
      vsc.commands.registerCommand(CmdId.zig.test, async (testStep: ZigTestStep) => {
        testStep.label = testStep.label ?? `test-${path.filename(testStep.buildArgs.testSrcFile)}`;
        testStep.buildArgs.mainPkgPath = testStep.buildArgs.mainPkgPath ?? path.dirname(testStep.buildArgs.testSrcFile);
        const taskDef: ZigTestTaskDefinition = {
          type: Const.testTaskType,
          label: testStep.label,
          buildArgs: {
            testSrcFile: testStep.buildArgs.testSrcFile,
            mainPkgPath: testStep.buildArgs.mainPkgPath,
          },
          runArgs: {
            debugLaunch: testStep.runArgs.debugLaunch,
            testFilter: testStep.runArgs.testFilter,
            cwd: testStep.runArgs.cwd,
          },
        };
        const zigTask = this.makeZigTestTask(taskDef);
        await this.runTestTask(zigTask);
      }),
    );
  }

  public provideTasks(): ZigTestTask[] {
    return [];
  }

  public resolveTask(task: ZigTestTask): ZigTestTask | undefined {
    if (task.definition['testSrcFile']) {
      return !task.execution
        ? this.makeZigTestTask(task.definition as ZigTestTaskDefinition)
        : task;
    }
    return undefined;
  }

  private async runTestTask(zigTask: ZigTestTask): Promise<void> {
    const taskDef = zigTask.definition as ZigTestTaskDefinition;
    try { if (!(await fs.dirExists(zig_cfg.outDir))) { await fs.createDir(zig_cfg.outDir); } } catch (e) {
      zig_logger.error(`Could not create testEmitBinDir: (${zig_cfg.outDir}) does not exists.`, e);
      return;
    }
    // Run Build Task
    const executionPromise = vsc.tasks.executeTask(zigTask);
    if (!taskDef.runArgs?.debugLaunch) {
      await executionPromise;
      return;
    }

    return await executionPromise.then(
      execution => {
        const onceTaskEvent = onceEvent(vsc.tasks.onDidEndTask, e => e.execution === execution);
        return new Promise<void>((resolve, reject) => onceTaskEvent(async _ => {
          try {
            // if (!(await fs.fileExists(debugArgs.program))) { throw new Error(`Failed to find compiled test binary: (${debugArgs.program})`); }
            if (Debugger.isActive(Debugger.vsdbg)) {
              await launchVsDbg({
                name:    `Zig Test Debug`,
                program: path.join(zig_cfg.outDir, `${taskDef.label}.exe`),
                args:    [zig_cfg.zig.binary],
                cwd:     taskDef.runArgs?.cwd,
                console: 'integratedTerminal',
              });
            }
            else if (Debugger.isActive(Debugger.lldb)) {
              await launchLLDB({
                name:    `Zig Test Debug`,
                program: path.join(zig_cfg.outDir, `${taskDef.label}.exe`),
                args:    [zig_cfg.zig.binary],
                cwd:     taskDef.runArgs?.cwd,
                console: 'integratedTerminal',
              });
            }
            else { throw new Error("cpptools/vscode-lldb extension must be enabled or installed."); }
            resolve();
          }
          catch (e) {
            zig_logger.error(`Could not launch debugger`, e);
            reject();
          }
        }));
      },
      e => {
        zig_logger.error(`zig build for ${taskDef.label} failed`, e);
      }
    );


  }
  private makeZigTestTask(taskDef: ZigTestTaskDefinition): ZigTestTask {
    const zig = zig_cfg.zig;
    const varCtx = new VariableResolver();
    const task = new ZigTestTask(
      taskDef,
      vsc.TaskScope.Workspace,
      taskDef.label,
      Const.taskProviderSourceStr,
      new vsc.ShellExecution(
        zig.binary, // isWindows ? `cmd /c chcp 65001>nul && ${zig.binary}` : zig.binary,
        [
          "test",
          taskDef.buildArgs.testSrcFile,
          ...(taskDef.buildArgs.mainPkgPath ? ["--main-pkg-path", taskDef.buildArgs.mainPkgPath] : []),
          `-femit-bin=` + path.join(zig_cfg.outDir, `${taskDef.label}.exe`),
          ...(taskDef.runArgs?.testFilter ? ["--test-filter", taskDef.runArgs.testFilter] : []),
          ...(taskDef.runArgs?.debugLaunch ? [`--test-no-exec`] : []),
          "--name", taskDef.label,
          "--enable-cache",
          "--cache-dir", zig_cfg.cacheDir,
        ].map(arg => varCtx.resolveVars(arg)),
        { cwd: zig.buildRootDir },
      ),
      zig.enableTaskProblemMatcher ? Const.problemMatcher : undefined,
    );
    task.group = vsc.TaskGroup.Test;
    task.detail = `zig test ${taskDef.label}`;
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
