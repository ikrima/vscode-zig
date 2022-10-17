'use strict';
import * as types from './types';

export class DebugBreakError extends Error {
  constructor(message?: string) {
    super(message || 'An unexpected bug occurred.');
    Object.setPrototypeOf(this, DebugBreakError.prototype);
    debugger; // eslint-disable-line no-debugger
  }
}
export function assertNever(_val: never, msg: string = 'Unreachable'): never { throw new Error(msg); }
export function debugAssert(cond: boolean): void  { if (!cond) { throw new DebugBreakError('Assertion Failed'); } }


export class StackTrace {
  public constructor(readonly stack: string) { }

  public toString(): string {
    return this.stack.split('\n').slice(2).join('\n');
  }
}

export function asStackTrace(srcObj: Error | unknown): StackTrace | undefined {
  const stack: string | undefined | null =
    types.isNativeError(srcObj)                      ? srcObj.stack    :
    types.hasPropOf(srcObj, 'stack', types.isString) ? srcObj.stack    :
    undefined;
  return stack ? new StackTrace(stack) : undefined;
}

export function stackTraceCapture(firstFrame?: Function): StackTrace;                                               // eslint-disable-line @typescript-eslint/ban-types
export function stackTraceCapture<T extends object>(targetObj: T, firstFrame?: Function): void;                     // eslint-disable-line @typescript-eslint/ban-types
export function stackTraceCapture<T extends object>(arg0: Function|undefined|T, arg1?: Function): StackTrace|void { // eslint-disable-line @typescript-eslint/ban-types
  if (types.isUndefined(arg0) || types.isFunction(arg0)) {
    const temp: { stack?: string } = {};
    Error.captureStackTrace(temp, arg0 ?? stackTraceCapture);
    return new StackTrace(temp.stack ?? "Could not capture stack trace");
  }
  else if (types.isGenericObj(arg0) && types.isFunction(arg1)) {
    Error.captureStackTrace(arg0, arg1 ?? stackTraceCapture);
    return;
  }
  else {
    return new StackTrace(new TypeError('Invalid parameters type').stack ?? 'Invalid parameters type');
  }
}
