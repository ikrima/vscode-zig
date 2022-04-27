'use strict';
import type * as vscode from 'vscode';

export function disposeAll(disposables: vscode.Disposable[]): void {
  while (disposables.length) {
    const item = disposables.pop();
    item?.dispose();
  }
}

export abstract class Disposable {
  private _isDisposed = false;
  private registrations: vscode.Disposable[] = [];

  public dispose(): void {
    if (this._isDisposed) { return; }
    this._isDisposed = true;
    disposeAll(this.registrations);
  }
  protected addDisposables<T extends vscode.Disposable>(...vals: T[]): void {
    if (this._isDisposed) { disposeAll(vals); }
    else                  { this.registrations.push(...vals);    }
  }
  public get isDisposed(): boolean { return this._isDisposed; }
}

export class DisposableCollection extends Disposable {
  constructor() { super(); }
  add<T extends vscode.Disposable>(...vals: T[]): void { this.addDisposables(...vals); }
}
