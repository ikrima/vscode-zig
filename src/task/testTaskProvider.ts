'use strict';
import * as vscode from "vscode";
import { ext, fs, path } from '../utils';
import { Disposable, DisposableCollection } from '../utils/dispose';
import { CmdConst, ExtConst } from "../zigConst";
import { zig_ext } from "../zigContext";
import type { ZigTestStep } from "./zigStep";
import ZigTestTask = vscode.Task;

interface ZigTestTaskDefinition extends vscode.TaskDefinition {
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
class ZigTestTaskProvider extends Disposable implements vscode.TaskProvider {
  constructor() { super(); }
  register() {
    this.addDisposables(
      vscode.commands.registerCommand(CmdConst.zig.test, async (testStep: ZigTestStep) => {
        testStep.label = testStep.label ?? `test-${path.filename(testStep.buildArgs.testSrcFile)}`;
        testStep.buildArgs.mainPkgPath = testStep.buildArgs.mainPkgPath ?? path.dirname(testStep.buildArgs.testSrcFile);
        const taskDef: ZigTestTaskDefinition = {
          type: ExtConst.testTaskType,
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
      vscode.tasks.registerTaskProvider(ExtConst.testTaskType, this),
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
    try { if (!(await fs.dirExists(zig_ext.zigCfg.outDir))) { await fs.createDir(zig_ext.zigCfg.outDir); } } catch (e) {
      zig_ext.logger.error(`Could not create testEmitBinDir: (${zig_ext.zigCfg.outDir}) does not exists.`, e);
      return;
    }
    // Run Build Task
    const execution = await vscode.tasks.executeTask(zigTask);


    if (taskDef.runArgs?.debugLaunch) {
      await new Promise<void>((resolve, reject) => {
        const taskEvent = new DisposableCollection();
        taskEvent.add(
          vscode.tasks.onDidEndTask(async (e) => {
            if (e.execution !== execution || taskEvent.isDisposed) { return; }
            taskEvent.dispose();
            try {
              // if (!(await fs.fileExists(debugArgs.program))) { throw new Error(`Failed to find compiled test binary: (${debugArgs.program})`); }
              if (ext.isExtensionActive(ExtConst.cppToolsExtId)) {
                await vscode.debug.startDebugging(
                  vscode.workspace.workspaceFolders?.[0],
                  {
                    type: 'cppvsdbg',
                    name: `Zig Test Debug`,
                    request: 'launch',
                    console: 'integratedTerminal',
                    program: path.join(zig_ext.zigCfg.outDir, `${taskDef.label}.exe`),
                    args: [zig_ext.zigCfg.zig.binary],
                    cwd: taskDef.runArgs?.cwd,
                  } as vscode.DebugConfiguration,
                );
              }
              else if (ext.isExtensionActive(ExtConst.lldbExtId)) { throw new Error("codeLLDB temporarily disabled"); }
              else { throw new Error("cpptools/vscode-lldb extension must be enabled or installed."); }
              resolve();
            }
            catch (e) {
              zig_ext.logger.error(`Could not launch debugger`, e);
              reject();
            }
          })
        );
      });
    }
  }
  private makeZigTestTask(taskDef: ZigTestTaskDefinition): ZigTestTask {
    const zig = zig_ext.zigCfg.zig;
    const varCtx = new ext.VariableResolver();
    const rslvdBldCmdArgs = {
      cmdArgs: [
        taskDef.buildArgs.testSrcFile,
        ...(taskDef.buildArgs.mainPkgPath ? ["--main-pkg-path", taskDef.buildArgs.mainPkgPath] : []),
        `-femit-bin=` + path.join(zig_ext.zigCfg.outDir, `${taskDef.label}.exe`),
        ...(taskDef.runArgs?.testFilter ? ["--test-filter", taskDef.runArgs.testFilter] : []),
        ...(taskDef.runArgs?.debugLaunch ? [`--test-no-exec`] : []),
        "--name", taskDef.label,
        "--enable-cache",
        "--cache-dir", zig_ext.zigCfg.cacheDir,
      ].map(arg => varCtx.resolveVars(arg)),
      cwd: zig.buildRootDir,
    };
    const task = new ZigTestTask(
      taskDef,
      vscode.TaskScope.Workspace,
      taskDef.label,
      ExtConst.taskProviderSourceStr,
      new vscode.ShellExecution(
        zig.binary, // ext.isWindows ? `cmd /c chcp 65001>nul && ${zig.binary}` : zig.binary;
        ["test", ...rslvdBldCmdArgs.cmdArgs],
        { cwd: rslvdBldCmdArgs.cwd },
      ),
      zig.enableTaskProblemMatcher ? ExtConst.problemMatcher : undefined,
    );
    task.group = vscode.TaskGroup.Test;
    task.detail = `zig test ${taskDef.label}`;
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

export function registerTestTaskProvider(): vscode.Disposable {
  const zigTestTaskProvider = new ZigTestTaskProvider();
  zigTestTaskProvider.register();
  return zigTestTaskProvider;
}
