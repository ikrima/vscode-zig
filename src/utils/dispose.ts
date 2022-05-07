'use strict';

export interface IDisposable {
  dispose(): void;
}

export const EmptyDisposable = Object.freeze<IDisposable>({ dispose: () => { } }); // eslint-disable-line @typescript-eslint/no-empty-function, @typescript-eslint/naming-convention

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

  protected addDisposable<T extends IDisposable>(val: T): T {
    if ((val as unknown) === this) { throw new Error('Cannot add a disposable on itself!'); }
    if (this._isDisposed) { val.dispose(); }
    else { this._disposables.push(val); }
    return val;
  }
  protected addDisposables<T extends IDisposable>(...vals: T[]): T[] {
    if (this._isDisposed) {
      while (vals.length) { vals.pop()?.dispose(); }
    }
    else {
      for (const o of vals) {
        if ((o as unknown) === this) { throw new Error('Cannot add a disposable on itself!'); }
        this._disposables.push(o);
      }
    }
    return vals;
  }
}
