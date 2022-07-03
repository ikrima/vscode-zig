'use strict';
import type * as vsc from 'vscode';
import { types } from '../utils/common';
import { IDisposable } from "./dispose";


export function onceFn<T extends (...args: unknown[]) => unknown>(
  fn: (...args: Parameters<T>) => ReturnType<T>,
): (...args: Parameters<T>) => ReturnType<T> {
  let didCall = false;
  let result: ReturnType<T>;

  return (...args: Parameters<T>): ReturnType<T> => {
    if (didCall) { return result; }
    didCall = true;
    result = fn(...args);
    return result;
  };
}

export function asPromise<T>(value: Promise<T> | Thenable<T> | (() => T)): Promise<T> {
  if (types.isPromise(value)) {
    return value;
  }
  else if (types.isThenable<T>(value)) {
		return new Promise((resolve, reject) => {
			value.then((resolved) => resolve(resolved), (error) => reject(error));
		});
  }
  else {
    types.assertType(types.isFunction(value));
    return new Promise<T>((resolve) => { resolve(value()); });
  }
}

export interface OnceEvent extends vsc.Disposable {
  isBound(): boolean; // in case the event fires during the listener call
  cancel(): void;
}
export namespace OnceEvent {
  export function once<T>(
    event: vsc.Event<T>,
    shouldEmit?: (e: T) => boolean,
    onCancel?: (reason?: unknown) => void,
  ) {
    return (listener: (e: T) => unknown, thisArgs?: unknown, disposables?: vsc.Disposable[]): OnceEvent => {
      let binding = IDisposable.None;
      let isQueued = true; // needed in case the event fires during the listener call
      const isBound = (): boolean => binding !== IDisposable.None;
      const unbind = (): void => {
        isQueued = false;
        if (isBound()) {
          binding.dispose();
          binding = IDisposable.None;
        }
      };
      const cancel = () => {
        if (isQueued && isBound()) {
          onCancel && onCancel();
        }
        unbind();
      };
      binding = event((e: T): unknown => {
        if (!isQueued) { return; }
        if (shouldEmit && !shouldEmit(e)) { return; }
        unbind();
        return listener.call(thisArgs, e);
      }, null, disposables);

      if (!isQueued && isBound()) { unbind(); }
      return {
        isBound: isBound,
        cancel: cancel,
        dispose: unbind,
      };
    };
  }
}
export function toPromise<T>(event: vsc.Event<T>): Promise<T> {
  return new Promise(resolve => OnceEvent.once(event)(resolve));
}




// export function onceFn<T extends (...args: unknown[]) => unknown>(
//   fn: (...args: Parameters<T>) => ReturnType<T>
// ): (...args: Parameters<T>) => ReturnType<T> {
//   let didCall = false;
//   let result: ReturnType<T>;

//   return (...args: Parameters<T>): ReturnType<T> => {
//     if (didCall) { return result; }
//     didCall = true;
//     result = fn(...args);
//     return result;
//   };
// }
// export function onceEvent<T>(event: vsc.Event<T>, filter?: (arg: T) => boolean): vsc.Event<T> {
//   const filtered_event = (listener: (e: T) => unknown, thisArgs?: unknown, disposables?: vsc.Disposable[]): vsc.Disposable => {
//     let didFire = false; // in case the event fires during the listener call
//     const result = event(e => {
//       if (didFire) { return; }
//       else if (filter ? filter(e) : true) {
//         didFire = true;
//         result.dispose();
//         return listener.call(thisArgs, e);
//       }
//     }, null, disposables);

//     return result;
//   };
//   return filtered_event;
// }


  // export interface TaskRunEvent {
  //   on_trigger: Promise<void>;
  //   isBound(): boolean; // in case the event fires during the listener call
  //   unbind(): void;
  // }
  // export function bindEvent(
  //   unfilteredTaskEvent: vsc.Event<TaskEventArg>,
  //   taskExecution: vsc.TaskExecution,
  //   callbacks?: {
  //     onResolve?: (value: void) => void;
  //     onReject?: (reason?: unknown) => void;
  //   },
  // ): TaskRunEvent {
  //   const ret = {
  //     on_trigger: Promise.resolve(),
  //     _disposable: undefined as vsc.Disposable | undefined,
  //     _isBound: true,
  //     taskExecution: taskExecution,
  //     isBound: function (): boolean { return this._isBound; },
  //     unbind: function (): void {
  //       if (!this._isBound) { return; }
  //       this._isBound = false;
  //       this._disposable?.dispose();
  //       this._disposable = undefined;
  //     },
  //   };
  //   ret.on_trigger = new Promise<void>((resolve, reject) => {
  //     ret._disposable = unfilteredTaskEvent((e: TaskEventArg) => {
  //       if (!ret._isBound && !ret._disposable) {
  //         return;
  //       }
  //       else if (ret._isBound && ret._disposable) {
  //         if (callbacks?.onReject) { callbacks.onReject(); }
  //         reject();
  //       }
  //       else if (ret.taskExecution === e.execution) {
  //         ret.unbind();
  //         if (callbacks?.onResolve) { callbacks.onResolve(); }
  //         resolve();
  //       }
  //     });
  //   });
  //   return ret;
  // }

  // export async function launch(task: vsc.Task): Promise<TaskInstance> {
  //   return await vsc.tasks.executeTask(task).then(
  //     (task_execution) => {
  //       let start_event: TaskRunEvent | undefined = undefined;
  //       let end_event: TaskRunEvent | undefined = undefined;
  //       start_event = TaskInstance.bindEvent(vsc.tasks.onDidStartTask, task_execution, {
  //         onReject: () => end_event?.unbind(),
  //       });
  //       end_event = TaskInstance.bindEvent(vsc.tasks.onDidEndTask, task_execution, {
  //         onReject: () => start_event?.unbind(),
  //       });
  //       return {
  //         on_task_start: start_event.on_trigger,
  //         on_task_end: end_event.on_trigger,
  //       } as TaskInstance;
  //     },
  //     e => {
  //       if (cp.isExecException(e)) {
  //         const cmd = e.cmd ? `  cmd   : ${e.cmd}` : undefined;
  //         const code = e.code ? `  code  : ${e.code}` : undefined;
  //         const signal = e.signal ? `  signal: ${e.signal}` : undefined;
  //         const stderr = types.isObject(e) && 'stderr' in e && types.isString(e['stderr'])
  //           ? `  task output: ${e['stderr']}`
  //           : undefined;
  //         const detail_msg = strings.filterJoin(os.EOL, [
  //           cmd,
  //           code,
  //           signal,
  //           stderr,
  //         ]);
  //         return Promise.reject(
  //           ScopedError.make(
  //             `${task.name} task run: finished with error(s)`,
  //             detail_msg,
  //             undefined,
  //             undefined,
  //             e.stack,
  //           )
  //         );
  //       }
  //       else {
  //         return Promise.reject(
  //           ScopedError.make(`${task.name} task run: finished with error(s)`, e)
  //         );
  //         // return Promise.reject(reason);
  //       }
  //     }
  //   );
  // }
