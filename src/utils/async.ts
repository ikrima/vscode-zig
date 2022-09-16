'use strict';
import type * as vsc from 'vscode';
import { IDisposable } from './dispose';
import * as types from './types';

export function sequentialResolve<T>(items: T[], promiseBuilder: (item: T) => Promise<void>): Promise<void> {
  return items.reduce(async (previousPromise, nextItem) => {
      await previousPromise;
      return promiseBuilder(nextItem);
  }, Promise.resolve());
}

export function asPromise<T>(value: Promise<T> | Thenable<T> | (() => T) | T): Promise<T> {
  if (types.isPromise(value)) {
    return value;
  }
  else if (types.isThenable<T>(value)) {
		return new Promise((resolve, reject) => {
			value.then((resolved) => resolve(resolved), (error) => reject(error));
		});
  }
  else if (types.isFunction(value)) {
    return new Promise<T>((resolve) => { resolve(value()); });
  }
  else {
		return Promise.resolve(value);
  }
}

export interface OnceEvent extends IDisposable {
  isBound(): boolean; // in case the event fires during the listener call
  cancel(): void;
}
export namespace OnceEvent {
  export function once<T>(
    event: vsc.Event<T>,
    shouldEmit?: (e: T) => boolean,
    onCancel?: (reason?: unknown) => void,
  ) {
    return (listener: (e: T) => unknown, thisArgs?: unknown, disposables?: IDisposable[]): OnceEvent => {
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
