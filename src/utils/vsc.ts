'use strict';
import * as vsc from 'vscode';
import { filterEvent, onceEvent, OnceEventHandle } from './async';
import { ScopedError } from './dbg';
import * as path from './path';
import * as plat from './plat';
import * as process from './process';
import * as strings from './strings';
import * as types from './types';

export function isExtensionActive   (extId: string): boolean                         { return vsc.extensions.getExtension(extId)?.isActive ?? false; }
export function findWorkspaceFolder (name: string):  vsc.WorkspaceFolder | undefined { return vsc.workspace.workspaceFolders?.find(wf => name.toLowerCase() === wf.name.toLowerCase()); }
export function defaultWksFolder    ():              vsc.WorkspaceFolder | undefined { return vsc.workspace.workspaceFolders?.[0]; }
export function defaultWksFolderPath():              string | undefined              { const folder = defaultWksFolder(); return folder ? path.normalize(folder.uri.fsPath) : undefined; }

export interface TaskInstance {
  onTaskStart: Promise<void>;
  onTaskEnd: Promise<void>;
}
export namespace TaskInstance {
  type TaskEventArg = vsc.TaskStartEvent | vsc.TaskEndEvent | vsc.TaskProcessStartEvent | vsc.TaskProcessEndEvent;
  export async function launch(task: vsc.Task): Promise<TaskInstance> {
    return vsc.tasks.executeTask(task).then(
      (execution: vsc.TaskExecution): TaskInstance => {
        const taskInstFilter    = (evt: TaskEventArg): boolean => execution === evt.execution;
        const onInstanceStarted = filterEvent(vsc.tasks.onDidStartTask, taskInstFilter);
        const onInstanceEnded   = filterEvent(vsc.tasks.onDidEndTask,   taskInstFilter);
        const eventFinalizer    = () => {
          onTaskStartEventHandle?.cancel();
          onTaskEndEventHandle?.cancel();
          onTaskStartEventHandle = undefined;
          onTaskEndEventHandle = undefined;
        };

        let onTaskStartEventHandle: OnceEventHandle | undefined = undefined;
        let onTaskEndEventHandle: OnceEventHandle | undefined = undefined;
        return {
          onTaskStart: new Promise<void>((resolve, reject) => {
            onTaskStartEventHandle = onceEvent(onInstanceStarted, reject)(_ => resolve());
          }).finally(eventFinalizer),
          onTaskEnd: new Promise<void>((resolve, reject) => {
            onTaskEndEventHandle = onceEvent(onInstanceEnded, reject)(_ => resolve());
          }).finally(eventFinalizer),
        };
      },
      (reason?: unknown) => {
        const scopedError = process.isExecException(reason)
          ? new ScopedError(
            `${task.name} task run: finished with error(s)`,
            strings.concatNotBlank(plat.eol, [
              reason.cmd                                        ? `  cmd   : ${reason.cmd}`            : undefined,
              reason.code                                       ? `  code  : ${reason.code}`           : undefined,
              reason.signal                                     ? `  signal: ${reason.signal}`         : undefined,
              types.hasPropOf(reason, 'stderr', types.isString) ? `  task output: ${reason['stderr']}` : undefined,
            ]),
            undefined,
            undefined,
            reason.stack)
          : new ScopedError(`${task.name} task run: finished with error(s)`, reason);
        return Promise.reject(scopedError);
      });
  }
}