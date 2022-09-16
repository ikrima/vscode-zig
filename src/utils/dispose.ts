'use strict';
import * as types from './types';
import { ScopedError } from './logging';
import { onceFn } from './functional';

export interface IDisposable {
  dispose(): void;
}
export namespace IDisposable {
  export const None = Object.freeze<IDisposable>({ dispose: () => { /*noop*/ } });
}
export function isDisposable<T extends object>(o: T): o is T & IDisposable {
  return typeof (o as IDisposable).dispose === 'function' && (o as IDisposable).dispose.length === 0;
}

export function asDisposable(callback: () => void): IDisposable {
  const ret = new DisposableBase();
  ret.addDisposeCallback(callback);
  return ret;
}
export function disposableFrom(...disposables: IDisposable[]): IDisposable {
  const ret = new DisposableBase();
  ret.addDisposables(...disposables);
  return ret;
}
export function disposeIfDisposable<T extends IDisposable | object>(disposables: T[]): void {
  for (const d of disposables) {
    if (isDisposable(d)) { d.dispose(); }
  }
}
export function disposeAll<T extends IDisposable>(disposables: T           ): T;
export function disposeAll<T extends IDisposable>(disposables: T|undefined ): T | undefined;
export function disposeAll<T extends IDisposable>(disposables: T[]         ): T[];
export function disposeAll<T extends IDisposable>(disposables: readonly T[]): readonly T[];
export function disposeAll<T extends IDisposable, A extends IterableIterator<T> = IterableIterator<T>>(disposables: IterableIterator<T>): A;
export function disposeAll<T extends IDisposable>(arg: T | undefined | IterableIterator<T>): unknown {
  if (types.isIterable(arg)) {
    const errors: unknown[] = [];

    for (const d of arg) {
      if (d) {
        try {
          d.dispose();
        } catch (e) {
          errors.push(e);
        }
      }
    }

    if (errors.length === 1) {
      throw ScopedError.wrap(errors[0]);
    } else if (errors.length > 1) {
      throw new ScopedError(`Encountered errors while disposing of store`, `Errors: [${errors.join(', ')}]`);
    }
    return types.isArray(arg) ? [] : arg;
  }
  else if (arg) {
    arg.dispose();
    return arg;
  }
  else {
    return undefined;
  }
}

export class DisposableBase implements IDisposable {
  private _toDispose = new Set<IDisposable>();
  private _isDisposed = false;

  public dispose(): void {
    if (this._isDisposed) { return; }
    this._isDisposed = true;
    this.clear();
  }

  public get isDisposed(): boolean { return this._isDisposed; }

  public addDisposable<T extends IDisposable>(o: T): T {
    if (!o) { return o; }
    if ((o as unknown as DisposableBase) === this) { throw new ScopedError('Cannot register a disposable on itself!'); }

    if (this._isDisposed) { console.warn('Adding to disposed store. Item will be leaked'); o.dispose(); }
    else { this._toDispose.add(o); }
    return o;
  }
  public addDisposeCallback(callback: () => void): void {
    this.addDisposable({ dispose: onceFn(callback) });
  }
  public addDisposables<T extends IDisposable>(...vals: T[]): void {
    if (this._isDisposed) {
      console.warn('Adding to disposed store. Item will be leaked');
      disposeAll(vals);
      return;
    }

    for (const o of vals) {
      this.addDisposable(o);
      // if (!o) { return o; }
      // if ((o as unknown as DisposableBase) === this) { throw new ScopedError('Cannot register a disposable on itself!'); }
      // this._toDispose.add(o);
    }
  }

  public clear(): void {
    try {
      disposeAll(this._toDispose.values());
    } finally {
      this._toDispose.clear();
    }
  }

}
