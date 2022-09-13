'use strict';

// Value that is resolved synchronously when it is first needed
export interface Lazy<T> {
  readonly hasVal: boolean;
  readonly val: T;
  reset(): void;
  map<R>(f: (x: T) => R): Lazy<R>;
  evalVal(force?: boolean): T;

}
export namespace Lazy {
  export function create<T>(evalFn: () => T): Lazy<T> {
    return new LazyValue<T>(evalFn);
  }
}

class LazyValue<T> implements Lazy<T> {
  private _hasVal: boolean = false;
  private _val?: T | undefined;

  constructor(
    private readonly evalFn: () => T
  ) { }

  public get hasVal(): boolean           { return this._hasVal; }
	public get val(): T                    { return this.evalVal(false); }
  public reset(): void                   { this._hasVal = false; this._val = undefined; }
  public map<R>(f: (x: T) => R): Lazy<R> { return new LazyValue<R>(() => f(this.val)); }

  public evalVal(force?: boolean): T {
    if (force) { this.reset(); }
    if (!this._hasVal) {
      this._val = this.evalFn();
      this._hasVal = true;
    }
    return this._val!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
  }
}
