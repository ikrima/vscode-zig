'use strict';
import type * as vscode from 'vscode';

export class DisposableStore {
  static readonly None = Object.freeze<vscode.Disposable>({ dispose: () => {} }); // eslint-disable-line @typescript-eslint/no-empty-function, @typescript-eslint/naming-convention
  private _isDisposed = false;
  private _toDispose: vscode.Disposable[] = [];

  public dispose(): void {
    if (this._isDisposed) { return; }
    const pending = this._toDispose;
    this._isDisposed = true;
    this._toDispose = [];
    for (let i = pending.length; i > 0; i--) { pending[i].dispose(); }
  }

  public get isDisposed(): boolean { return this._isDisposed; }

  public addDisposables<T extends vscode.Disposable>(...vals: T[]): void {
    if (this._isDisposed) {
      while (vals.length) { vals.pop()?.dispose(); }
    }
    else                  {
      for(const o of vals) {
        if ((o as unknown) === this) { throw new Error('Cannot register a disposable on itself!'); }
        this._toDispose.push(o);
      }
    }
  }
}
