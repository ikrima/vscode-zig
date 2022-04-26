'use strict';
import * as vscode from "vscode";
import { CmdConst, ExtConst } from "../zigConst";
import { ZigExt } from "../zigContext";
import { fs, ext, path } from '../utils';
// import * as jsyaml from 'js-yaml';

import ZigTestTask = vscode.Task;

interface ZigTestTaskDefinition extends vscode.TaskDefinition {
  testSrcFile:  string;
  testName?:    string;
  testFilter?:  string;
  mainPkgPath?: string;
  testBinary?:  string;
  debugMode?:   boolean;
}

class ZigTestTaskProvider implements vscode.TaskProvider {
  private registrations: vscode.Disposable[] = [];
  register() {
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
      vscode.tasks.registerTaskProvider(ExtConst.testTaskType, this),
    );

  }

  dispose(): void {
    this.registrations.forEach(d => void d.dispose());
    this.registrations = [];
  }
  public provideTasks(): ZigTestTask[] {
    return [];
  }

  public resolveTask(task: ZigTestTask): ZigTestTask | undefined {
    if (!task.execution) {
      const taskDef = task.definition as ZigTestTaskDefinition;
      task = this.resolveTaskReal(taskDef);
      return task;
    }
    return undefined;
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
        try { await fs.mkdir(testBinDir); } catch (e) {
          ZigExt.logger.error(`Could not create testEmitBinDir: (${taskDef.testBinary}) does not exists.`, e);
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
            catch (e) {
              ZigExt.logger.error(`Could not launch debugger`, e);
              reject();
            }
          });
        });
      }
    }
    catch (e) {
      ZigExt.logger.error(`Could not execute task: ${zigTask.name}.`, e);
      return;
    }
  }
  private resolveTaskReal(
    taskDef: ZigTestTaskDefinition,
  ): ZigTestTask {
    const zig = ZigExt.zigCfg.zig;
    const testSrcFile = path.normalize(taskDef.testSrcFile);
    const testName    = taskDef.testName   ?? `test-${path.filename(testSrcFile)}`;
    const testBinary  = taskDef.testBinary ?? path.join(zig.buildRootDir, "zig-out", "bin", `${testName}.exe`);

    const varCtx = new ext.VariableResolver();
    const resolvedTaskArgs = {
      cmdArgs: [
        path.normalize(testSrcFile),
        ...(taskDef.mainPkgPath ? ["--main-pkg-path", taskDef.mainPkgPath] : []),
        `-femit-bin=${testBinary}`,
        ...(taskDef.testFilter ? ["--test-filter", taskDef.testFilter] : []),
        ...(taskDef.debugMode ? [`--test-no-exec`] : []),
        "--name", testName,
        "--enable-cache",
      ].map(arg => varCtx.resolveVars(arg)),
      cwd: zig.buildRootDir,
    };

    const task = new ZigTestTask(
      taskDef,
      vscode.TaskScope.Workspace,
      testName,
      ExtConst.taskProviderSourceStr,
      new vscode.ShellExecution(
        zig.binary, // ext.isWindows ? `cmd /c chcp 65001>nul && ${zig.binary}` : zig.binary;
        [
          "test",
          ...resolvedTaskArgs.cmdArgs,
        ],
        { cwd: resolvedTaskArgs.cwd },
      ),
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
        {
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

export function createTestTaskProvider(): vscode.Disposable {
  const zigTestTaskProvider = new ZigTestTaskProvider();
  zigTestTaskProvider.register();
  return zigTestTaskProvider;
}
