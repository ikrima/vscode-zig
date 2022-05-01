'use strict';
import * as vscode from 'vscode';
import * as os from 'os';
import { types } from '../utils/common';

export enum LogLevel {
  off     = -1,
  error   = 0,
  warn    = 1,
  info    = 2,
  trace   = 3,
}
// export type LogLevelKey = keyof typeof LogLevel;
export type LogLevelKey = 'off' | 'error' | 'warn' | 'info' | 'trace';
export namespace LogLevel {
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
  export function channelLogger(chan: vscode.OutputChannel, maxLogLevel: LogLevel): Logger {
    return {
      maxLogLevel: maxLogLevel,
      write:       val => chan.append(val),
      clear:       () => chan.clear(),
      error:       function (msg:  string, data?: Error|unknown|null, reveal?: boolean): void { this.logItem({level: LogLevel.error , msg: msg, reveal: reveal ?? true  , data: data ?? null}); },
      warn:        function (msg:  string, data?: Error|unknown|null, reveal?: boolean): void { this.logItem({level: LogLevel.warn  , msg: msg, reveal: reveal ?? true  , data: data ?? null}); },
      info:        function (msg:  string, data?: Error|unknown|null, reveal?: boolean): void { this.logItem({level: LogLevel.info  , msg: msg, reveal: reveal ?? false , data: data ?? null}); },
      trace:       function (msg:  string, data?: Error|unknown|null, reveal?: boolean): void { this.logItem({level: LogLevel.trace , msg: msg, reveal: reveal ?? false , data: data ?? null}); },
      logItem:     function (item: LogItem): void {
        if (item.level > this.maxLogLevel) { return; }
        this.write(LogItem.toString(item));
        switch(item.reveal ? item.level : LogLevel.off) {
          case LogLevel.off:     break;
          case LogLevel.error:   void vscode.window.showErrorMessage       (item.msg); break;
          case LogLevel.warn:    void vscode.window.showWarningMessage     (item.msg); break;
          case LogLevel.info:    void vscode.window.showInformationMessage (item.msg); break;
          case LogLevel.trace:   void vscode.window.showInformationMessage (item.msg); break;
        }
      }
    };
  }
}