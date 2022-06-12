'use strict';
import * as vsc from 'vscode';
import * as os from 'os';
import { strings, types } from '../utils/common';

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
    const stack = types.isNativeError(detail) && detail.stack ? detail.stack : undefined;
    return strings.filterJoin([
      message,
      detail_msg ? `  Error: ${detail_msg}` : null,
      stack      ? `  StackTrace: ${stack}` : null,
    ], os.EOL);
  }
}

export class ScopedError extends Error {
  private constructor(
    message: string | undefined,
    public readonly level: LogLevel,
    public readonly reveal: boolean,
    public readonly detail_msg?: string | undefined,
  ) {
    super(message);
    this.name = 'ScopedError';
  }

  public override toString(): string {
    return strings.filterJoin([
      this.message,
      this.detail_msg ? `  Error: ${this.detail_msg}` : null,
      this.stack      ? `  StackTrace: ${this.stack}` : null,
    ], os.EOL);
  }

  public static is(o: unknown): o is ScopedError {
    return (o instanceof ScopedError) || (o instanceof Error && o.name === 'ScopedError');
  }
  public static make(
    message?: string | undefined,
    detail?: Error | string | unknown | null,
    level?: LogLevel,
    reveal?: boolean | undefined,
    stack?: string | undefined,
  ): ScopedError {
    const detail_msg =
      types.isNativeError(detail) ? detail.message :
      types.isString     (detail) ? detail         :
      types.isDefined    (detail) ? String(detail) :
      undefined;
    const err = new ScopedError(
      message,
      level  ?? LogLevel.error,
      reveal ?? (level ? level === LogLevel.error || level === LogLevel.warn : true),
      detail_msg,
    );
    if       (stack)                                       { err.stack = stack; }
    else if  (types.isNativeError(detail) && detail.stack) { err.stack = detail.stack; }
    else                                                   { Error.captureStackTrace(err); }
    return err;
  }

  static wrap(
    arg:          ScopedError | Error | string | unknown | null,
    fallback_msg: string = "Unknown Error",
  ): ScopedError {
    if (ScopedError.is(arg)) { return arg; }
    else                     { return ScopedError.make(fallback_msg, arg); }
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
      error:       function (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void { this.logMsg(ScopedError.make(msg, detail, LogLevel.error, reveal)); },
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