'use strict';

import { ScopedError } from "./logging";

export interface IDisposable {
  dispose(): void;
}

export namespace IDisposable {
  export const None = Object.freeze<IDisposable>({ dispose: () => { /*noop*/ } });
}

export class DisposableStore {
  private _isDisposed = false;
  private _disposables: IDisposable[] = [];

  public dispose(): void {
    if (this._isDisposed) { return; }
    const pending = this._disposables;
    this._isDisposed = true;
    this._disposables = [];
    for (let i = pending.length; i > 0; i--) { pending[i].dispose(); }
  }

  public get isDisposed(): boolean { return this._isDisposed; }

  protected addDisposable<T extends IDisposable>(o: T): T {
		if (!o)                                         { return o; }
		if ((o as unknown as DisposableStore) === this) { throw ScopedError.make('Cannot add a disposable on itself!'); }

    if (this._isDisposed) { o.dispose();               }
    else                  { this._disposables.push(o); }
    return o;
  }
  protected addDisposables<T extends IDisposable>(...vals: T[]): T[] {
    if (this._isDisposed) {
      while (vals.length) { vals.pop()?.dispose(); }
    }
    else {
      for (const o of vals) {
        if ((o as unknown) === this) { throw ScopedError.make('Cannot add a disposable on itself!'); }
        this._disposables.push(o);
      }
    }
    return vals;
  }
}
