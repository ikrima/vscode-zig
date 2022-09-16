'use strict';
import * as os from 'os';
import * as vsc from 'vscode';
import * as strings from './strings';
import * as types from './types';

export enum LogLevel {
  off     = 'off',
  error   = 'error',
  warn    = 'warn',
  info    = 'info',
  trace   = 'trace',
}
type LogLevelInt = -1    | 0       | 1      | 2      | 3;
type LogLevelKey = 'off' | 'error' | 'warn' | 'info' | 'trace'; // export type LogLevelKey = keyof typeof LogLevel;
export namespace LogLevel {
  export function toInt(value: LogLevel): LogLevelInt {
    switch (value) {
      case LogLevel.off:     return -1;
      case LogLevel.error:   return 0;
      case LogLevel.warn:    return 1;
      case LogLevel.info:    return 2;
      case LogLevel.trace:   return 3;
    }
  }
  export function fromString(value: LogLevelKey): LogLevel {
    switch (value) {
      case 'off':     return LogLevel.off;
      case 'error':   return LogLevel.error;
      case 'warn':    return LogLevel.warn;
      case 'info':    return LogLevel.info;
      case 'trace':   return LogLevel.trace;
    }
  }
  export function isEnabled(level: LogLevel, max_level: LogLevel): boolean {
    return LogLevel.toInt(level) <= LogLevel.toInt(max_level);
  }
}

export class StackTrace {
  public constructor(readonly stack: string) { }

  public toString(): string {
    return this.stack.split('\n').slice(2).join('\n');
  }
}

export function asStackTrace(srcObj: Error | unknown): StackTrace | undefined {
  const stack: string | undefined | null =
    types.isNativeError(srcObj)                                 ? srcObj.stack    :
    (types.isObject(srcObj) && types.isString(srcObj['stack'])) ? srcObj['stack'] :
    undefined;
  return stack ? new StackTrace(stack) : undefined;
}

export function stackTraceCapture(firstFrame?: Function): StackTrace;                                               // eslint-disable-line @typescript-eslint/ban-types
export function stackTraceCapture<T extends object>(targetObj: T, firstFrame?: Function): void;                     // eslint-disable-line @typescript-eslint/ban-types
export function stackTraceCapture<T extends object>(arg0: Function|undefined|T, arg1?: Function): StackTrace|void { // eslint-disable-line @typescript-eslint/ban-types
  if (types.isUndefined(arg0) || types.isFunction(arg0)) {
    const temp: { stack?: string } = {};
    Error.captureStackTrace(temp, arg0 ?? stackTraceCapture);
    return new StackTrace(temp.stack ?? '');
  }
  else if (types.isObject(arg0) && types.isFunction(arg1)) {
    Error.captureStackTrace(arg0, arg1 ?? stackTraceCapture);
    return;
  }
  else {
    return new StackTrace(new TypeError('Invalid parameters type').stack ?? 'Invalid parameters type');
  }
}

export interface ScopedMsg {
  level:   LogLevel;
  message: string;
  detail:  Error | unknown | null;
  reveal:  boolean;
}
export namespace ScopedMsg {
  export function make(level: LogLevel, message: string, detail?: Error | unknown | null, reveal?: boolean): ScopedMsg {
    return {
      level: level,
      message: message,
      reveal: reveal ?? (reveal === LogLevel.error || level === LogLevel.warn),
      detail: detail ?? null,
    };
  }

  export function is(o: unknown): o is ScopedMsg { return types.isObject(o) && 'level' in o; }

  export function toString(item: ScopedMsg): string {
    const detail = item.detail;
    const message = item.message;
    const detail_msg =
      types.isNativeError(detail) ? detail.message :
      types.isString     (detail) ? detail         :
      types.isDefined    (detail) ? String(detail) :
      undefined;
    const trace = asStackTrace(detail);
    return strings.filterJoin(os.EOL, [
      message,
      detail_msg ? `  Error: ${detail_msg}` : null,
      trace      ? `  StackTrace: ${trace.toString()}` : null,
    ]);
  }
}

export class ScopedError extends Error {
  public readonly level: LogLevel;
  public readonly reveal: boolean;
  public readonly detail_msg?: string | undefined;

  constructor(
    message?: string | undefined,
    detail?: Error | string | unknown | null,
    level?: LogLevel,
    reveal?: boolean | undefined,
    stack?: string | undefined,
  ) {
    super(message);
    this.name = 'ScopedError';

    const detail_msg =
      types.isNativeError(detail) ? detail.message :
      types.isString     (detail) ? detail         :
      types.isDefined    (detail) ? String(detail) :
      undefined;
    this.level      = level  ?? LogLevel.error,
    this.reveal     = reveal ?? (level ? level === LogLevel.error || level === LogLevel.warn : true);
    this.detail_msg = detail_msg;

    stack = stack ?? asStackTrace(detail)?.stack ?? '';
    if (!strings.isWhiteSpace(stack)) { this.stack = stack; }
    else                              { stackTraceCapture(this, this.constructor); }
  }

  public override toString(): string {
    const stack = asStackTrace(this.stack);
    return strings.filterJoin(os.EOL, [
      this.message,
      this.detail_msg ? `  Error: ${this.detail_msg}`       : null,
      stack           ? `  StackTrace: ${stack.toString()}` : null,
    ]);
  }

  public static is(o: unknown): o is ScopedError {
    return (o instanceof ScopedError) || (o instanceof Error && o.name === 'ScopedError');
  }
  public static reject(
    message?: string | undefined,
    detail?: Error | string | unknown | null,
    level?: LogLevel,
    reveal?: boolean | undefined,
    stack?: string | undefined,
  ): Promise<never> {
    return Promise.reject(new ScopedError(message, detail, level, reveal, stack));
  }

  static wrap(
    arg:          ScopedError | Error | string | unknown | null,
    fallback_msg: string = "Unknown Error",
  ): ScopedError {
    if (ScopedError.is(arg)) { return arg; }
    else                     { return new ScopedError(fallback_msg, arg); }
  }

}

export interface Logger {
  maxLogLevel : LogLevel;
  write   (val: string): void;
  clear   (): void;
  error   (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void;
  warn    (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void;
  info    (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void;
  trace   (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void;
  logMsg  (item: ScopedError|ScopedMsg): void;
}

export namespace Logger {
  export function channelLogger(chan: vsc.OutputChannel, maxLogLevel: LogLevel): Logger {
    return {
      maxLogLevel: maxLogLevel,
      write:       val => chan.append(val),
      clear:       ()  => chan.clear(),
      error:       function (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void { this.logMsg(new ScopedError(msg, detail, LogLevel.error, reveal)); },
      warn:        function (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void { this.logMsg(ScopedMsg.make(LogLevel.warn  , msg, detail, reveal)); },
      info:        function (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void { this.logMsg(ScopedMsg.make(LogLevel.info  , msg, detail, reveal)); },
      trace:       function (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void { this.logMsg(ScopedMsg.make(LogLevel.trace , msg, detail, reveal)); },
      logMsg:      function (arg: ScopedError|ScopedMsg): void {
        if (!LogLevel.isEnabled(arg.level, this.maxLogLevel)) { return; }
        const msg_string = ScopedError.is(arg) ? arg.toString() : ScopedMsg.toString  (arg);
        this.write(msg_string);
        switch(arg.reveal ? arg.level : LogLevel.off) {
          case LogLevel.off:     break;
          case LogLevel.error:   void vsc.window.showErrorMessage       (arg.message); break;
          case LogLevel.warn:    void vsc.window.showWarningMessage     (arg.message); break;
          case LogLevel.info:    void vsc.window.showInformationMessage (arg.message); break;
          case LogLevel.trace:   void vsc.window.showInformationMessage (arg.message); break;
        }
      },
    };
  }
}