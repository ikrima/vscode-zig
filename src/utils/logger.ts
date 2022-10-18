'use strict';
import * as vsc from 'vscode';
import { asStackTrace, isScopedError, LogLevel, ScopedError } from './dbg';
import * as plat from './plat';
import * as strings from './strings';
import * as types from './types';

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
  export function toString(item: ScopedMsg): string {
    const detail = item.detail;
    const message = item.message;
    const detail_msg =
      types.isNativeError(detail) ? detail.message :
      types.isString     (detail) ? detail         :
      types.isDefined    (detail) ? String(detail) :
      undefined;
    const trace = asStackTrace(detail)?.toString();
    return strings.concatNotBlank(plat.eol, [
      message,
      detail_msg ? `  Error: ${detail_msg}` : null,
      trace      ? `  StackTrace: ${trace}` : null,
    ]);
  }
}
export function isScopedMsg(o: unknown): o is ScopedMsg {
  return types.hasPropOf (o, 'level',   types.isDefined)
    && types.hasPropOf   (o, 'message', types.isString)
    && types.hasPropKey  (o, 'detail')
    && types.hasPropOf   (o, 'reveal',  types.isBoolean);
}


export interface Logger {
  maxLogLevel : LogLevel;
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
      clear:       ()  => chan.clear(),
      error:       function (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void { this.logMsg(new ScopedError(msg, detail, LogLevel.error, reveal)); },
      warn:        function (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void { this.logMsg(ScopedMsg.make(LogLevel.warn  , msg, detail, reveal)); },
      info:        function (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void { this.logMsg(ScopedMsg.make(LogLevel.info  , msg, detail, reveal)); },
      trace:       function (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void { this.logMsg(ScopedMsg.make(LogLevel.trace , msg, detail, reveal)); },
      logMsg:      function (arg: ScopedError|ScopedMsg): void {
        if (!LogLevel.isEnabled(arg.level, this.maxLogLevel)) { return; }
        const msg_string = isScopedError(arg) ? arg.toString() : ScopedMsg.toString  (arg);
        chan.append(msg_string);
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
  export function consoleLogger(maxLogLevel: LogLevel): Logger {
    return {
      maxLogLevel: maxLogLevel,
      clear:       ()  => globalThis.console.clear(),
      error:       function (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void { this.logMsg(new ScopedError(msg, detail, LogLevel.error, reveal)); },
      warn:        function (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void { this.logMsg(ScopedMsg.make(LogLevel.warn  , msg, detail, reveal)); },
      info:        function (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void { this.logMsg(ScopedMsg.make(LogLevel.info  , msg, detail, reveal)); },
      trace:       function (msg: string, detail?:  Error|unknown|null, reveal?: boolean): void { this.logMsg(ScopedMsg.make(LogLevel.trace , msg, detail, reveal)); },
      logMsg:      function (arg: ScopedError|ScopedMsg): void {
        if (!LogLevel.isEnabled(arg.level, this.maxLogLevel)) { return; }
        const msg_string = isScopedError(arg) ? arg.toString() : ScopedMsg.toString(arg);
        switch(arg.level) {
          case LogLevel.off:     break;
          case LogLevel.error:   globalThis.console.error(msg_string); break;
          case LogLevel.warn:    globalThis.console.warn (msg_string); break;
          case LogLevel.info:    globalThis.console.info (msg_string); break;
          case LogLevel.trace:   globalThis.console.trace(msg_string); break;
        }
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

export const consoleLog = Logger.consoleLogger(LogLevel.trace);
