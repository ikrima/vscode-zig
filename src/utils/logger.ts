'use strict';
import * as vsc from 'vscode';
import * as os from 'os';
import { types } from '../utils/common';

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
}

export interface LogItem {
  level:   LogLevel;
  msg:     string;
  data:    Error | unknown | null;
  reveal:  boolean;
}
export namespace LogItem {
  export function make(level: LogLevel, msg: string, data?: Error | unknown | null, reveal?: boolean): LogItem {
    return {
      level: level,
      msg: msg,
      reveal: reveal ?? (reveal === LogLevel.error || level === LogLevel.warn),
      data: data ?? null,
    };
  }

  export function is(o: unknown): o is LogItem { return types.isObject(o) && 'level' in o; }

  export function toString(item: LogItem): string {
    const strVals = [item.msg];
    if (types.isNativeError(item.data)) {
      strVals.push(`  Error: ${item.data.message}`);
      if (types.isString(item.data.stack)) { strVals.push(`  StackTrace: ${item.data.stack}`); }
    }
    else if (types.isString(item.data)) {
      strVals.push(item.data);
    }
    else if (!types.isNullOrUndefined(item.data)) {
      strVals.push(String(item.data));
    }
    return strVals.join(os.EOL);
  }
}

export interface Logger {
  maxLogLevel : LogLevel;
  write   (val: string): void;
  clear   (): void;
  logItem (item: LogItem): void;
  error   (msg: string, data?: Error | unknown | null, reveal?: boolean): void;
  warn    (msg: string, data?: Error | unknown | null, reveal?: boolean): void;
  info    (msg: string, data?: Error | unknown | null, reveal?: boolean): void;
  trace   (msg: string, data?: Error | unknown | null, reveal?: boolean): void;
}

export namespace Logger {
  export const noopLogger: Logger = {
    maxLogLevel: LogLevel.off,
    write:       _val => { /*noop*/ },
    clear:       ()   => { /*noop*/ },
    error:       function (_msg:  string, _data?: Error|unknown|null, _reveal?: boolean): void { /*noop*/ },
    warn:        function (_msg:  string, _data?: Error|unknown|null, _reveal?: boolean): void { /*noop*/ },
    info:        function (_msg:  string, _data?: Error|unknown|null, _reveal?: boolean): void { /*noop*/ },
    trace:       function (_msg:  string, _data?: Error|unknown|null, _reveal?: boolean): void { /*noop*/ },
    logItem:     function (_item: LogItem): void { /*noop*/  },
  };

  export function channelLogger(chan: vsc.OutputChannel, maxLogLevel: LogLevel): Logger {
    return {
      maxLogLevel: maxLogLevel,
      write:       val => chan.append(val),
      clear:       () => chan.clear(),
      error:       function (msg:  string, data?: Error|unknown|null, reveal?: boolean): void { this.logItem(LogItem.make(LogLevel.error , msg, data, reveal)); },
      warn:        function (msg:  string, data?: Error|unknown|null, reveal?: boolean): void { this.logItem(LogItem.make(LogLevel.warn  , msg, data, reveal)); },
      info:        function (msg:  string, data?: Error|unknown|null, reveal?: boolean): void { this.logItem(LogItem.make(LogLevel.info  , msg, data, reveal)); },
      trace:       function (msg:  string, data?: Error|unknown|null, reveal?: boolean): void { this.logItem(LogItem.make(LogLevel.trace , msg, data, reveal)); },
      logItem:     function (item: LogItem): void {
        if (LogLevel.toInt(item.level) > LogLevel.toInt(this.maxLogLevel)) { return; }
        this.write(LogItem.toString(item));
        switch(item.reveal ? item.level : LogLevel.off) {
          case LogLevel.off:     break;
          case LogLevel.error:   void vsc.window.showErrorMessage       (item.msg); break;
          case LogLevel.warn:    void vsc.window.showWarningMessage     (item.msg); break;
          case LogLevel.info:    void vsc.window.showInformationMessage (item.msg); break;
          case LogLevel.trace:   void vsc.window.showInformationMessage (item.msg); break;
        }
      },
    };
  }
}