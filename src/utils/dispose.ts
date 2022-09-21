'use strict';
import * as types from './types';
import { ScopedError, consoleLog } from './logging';
import { onceFn } from './functional';

export interface IDisposable {
  dispose(): void;
}
export namespace IDisposable {
  export const None = Object.freeze<IDisposable>({ dispose: () => { /*noop*/ } });
  // export function isDisposable<T extends object>(o: T): o is T & IDisposable {
  //   return typeof (o as IDisposable).dispose === 'function' && (o as IDisposable).dispose.length === 0;
  // }
}
export function isDisposable(o: unknown): o is IDisposable {
  if (o === IDisposable.None) { return true; }
  if (!o || typeof o !== 'object') { return false; }
  return typeof (o as IDisposable).dispose === 'function' && (o as IDisposable).dispose.length === 0;
}

export function asDisposable(callback: () => void): IDisposable {
  const ret = new DisposableSet();
  ret.addDisposeCallback(callback);
  return ret;
}
export function combineDisposables(...disposables: IDisposable[]): IDisposable {
  const ret = new DisposableSet();
  for (const o of disposables) { ret.addDisposable(o); }
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
        } catch (err) {
          errors.push(err);
        }
      }
    }

    if (errors.length === 1) {
      throw ScopedError.wrap(errors[0]);
    } else if (errors.length > 1) {
      throw new ScopedError(`Encountered errors while disposing`, `Errors: [${errors.join(', ')}]`);
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

export class DisposableSet implements IDisposable {
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
    if ((o as unknown as DisposableSet) === this) { throw new ScopedError('Cannot register a disposable on itself!'); }

    if (this._isDisposed) { consoleLog.warn('Adding to already disposed set. Item will be leaked'); o.dispose(); }
    else { this._toDispose.add(o); }

    return o;
  }
  public addDisposeCallback(callback: () => void): void {
    this.addDisposable({ dispose: onceFn(callback) });
  }

  public clear(): void {
    try {
      disposeAll(this._toDispose.values());
    } finally {
      this._toDispose.clear();
    }
  }

}


export abstract class DisposableBase implements IDisposable {
  protected readonly _store = new DisposableSet();

  public dispose(): void {
    this._store.dispose();
  }
  protected _register<T extends IDisposable>(o: T): T {
    if ((o as unknown as DisposableBase) === this) {
      throw new ScopedError('Cannot register a disposable on itself!');
    }
    return this._store.addDisposable(o);
  }
  protected _registerMany<T extends IDisposable>(...vals: T[]): void {
    for (const o of vals) {
      this._register(o);
    }
  }
}

// Manages the lifecycle of a disposable value that may be changed.
//  - ensures that when the disposable value is changed, the previously held disposable is disposed of.
//  - can also register a `MutableDisposable` on a `Disposable` to ensure it is automatically cleaned u
export class MutableDisposable<T extends IDisposable> implements IDisposable {
  private _value?: T | undefined;
  private _isDisposed = false;

  public dispose(): void {
    this._isDisposed = true;
    this._value?.dispose();
    this._value = undefined;
  }

  public get value(): T | undefined { return !this._isDisposed ? this._value : undefined; }
  public set value(v: T | undefined) {
    if (this._isDisposed || v === this._value) { return; }
    this._value?.dispose();
    this._value = v;
  }

  clear() {
    this._value = undefined;
  }
  clearAndLeak(): T | undefined {
    const old = this._value;
    this._value = undefined;
    return old;
  }
}
