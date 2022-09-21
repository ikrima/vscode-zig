'use strict';
import type * as vsc from 'vscode';
import { IDisposable, MutableDisposable } from './dispose';
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

export function eventToPromise<T>(event: vsc.Event<T>): Promise<T> {
  return new Promise<T>(resolve => onceEvent(event)(resolve));
}

export function filterEvent<T>(event: vsc.Event<T>, filterPred: (e: T) => boolean): vsc.Event<T> {
  return (listener: (e: T) => unknown, thisArgs?: unknown, disposables?: IDisposable[]) => {
    return event(e => filterPred(e) && listener.call(thisArgs, e), null, disposables);
  };
}

export interface OnceEventHandle extends IDisposable {
  hasBinding(): boolean;
  cancel(): void;
}
export interface OnceEvent<T> {
  (listener: (e: T) => unknown, thisArgs?: unknown, disposables?: IDisposable[]): OnceEventHandle;
}
export function onceEvent<T>(
  event: vsc.Event<T>,
  onCancel?: (reason?: unknown) => void,
): OnceEvent<T> {
  return (listener: (e: T) => unknown, thisArgs?: unknown, disposables?: IDisposable[]): OnceEventHandle => {
    let isPendingTrigger = true; // needed in case the event fires during the listener call
    const subscription = new MutableDisposable<IDisposable>();
    subscription.value = event((e: T): unknown => {
      if (!isPendingTrigger) { return; }
      unbind();
      return listener.call(thisArgs, e);
    }, null, disposables);

    const hasBinding = (): boolean => !!subscription.value;
    const unbind = (): void => {
      isPendingTrigger = false;
      subscription.dispose();
    };
    const cancel = () => {
      const needsCancel = isPendingTrigger && hasBinding() && onCancel;
      unbind();
      if (needsCancel) { onCancel(); }
    };

    if (!isPendingTrigger && hasBinding()) { unbind(); }
    return {
      hasBinding: hasBinding,
      dispose: unbind,
      cancel: cancel,
    };
  };
}
