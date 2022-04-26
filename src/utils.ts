'use strict';
import * as vscode from "vscode";
import * as os from 'os';
import * as process_ from 'process';
import * as path_ from 'path';
import * as fs_ from 'fs';
import * as cp_ from 'child_process';
import { promisify, types as types_ } from 'util';

// Common helper functions
export namespace types {
  export const {
    isDate,
    isRegExp,
    isNativeError,
    isBooleanObject,
    isNumberObject,
    isStringObject,
    isSymbolObject,
    isBoxedPrimitive,
    isMap,
    isSet,
    isPromise,
    isProxy,
    isAsyncFunction,
  } = types_;

  export function isUndefined         (o: unknown): o is undefined      { return o === undefined;                                                      }
  export function isNull              (o: unknown): o is null           { return o === null;                                                           }
  export function isNullOrUndefined   (o: unknown): o is null|undefined { return o === undefined || o === null;                                        }
  export function isSymbol            (o: unknown): o is symbol         { return typeof o === 'symbol';                                                }
  export function isBoolean           (o: unknown): o is boolean        { return typeof o === 'boolean';                                               }
  export function isNumber            (o: unknown): o is number         { return typeof o === "number";                                                }
  export function isString            (o: unknown): o is string         { return typeof o === "string";                                                }
  export function isArray<T>          (o: unknown): o is T[]            { return Array.isArray(o);                                                     }
  export function isObject            (o: unknown): o is boolean        { return o !== null && typeof o === 'object' && !(isArray(o) || isRegExp(o) || isDate(o)); }
  export function isFunction          (o: unknown): boolean             { return typeof o === 'function';                                             }
  export function isPrimitive         (o: unknown): boolean             { return (typeof o !== 'object' && typeof o !== 'function') || o === null;    }
  export function isStringArray       (o: unknown): o is string[]       { return Array.isArray(o) && (<unknown[]>o).every(e => isString(e));          }
  export function isNonBlank          (o: string ): boolean             { return o.length > 0 && /\S/.test(o);                                        }

  type Clonable = null | undefined | boolean | number | string | Date | RegExp | unknown[] | Record<string,unknown>;
  export function deepCopy   (src: null                  ): null                   ;
  export function deepCopy   (src: undefined             ): undefined              ;
  export function deepCopy   (src: boolean               ): boolean                ;
  export function deepCopy   (src: number                ): number                 ;
  export function deepCopy   (src: string                ): string                 ;
  export function deepCopy   (src: Date                  ): Date                   ;
  export function deepCopy   (src: RegExp                ): RegExp                 ;
  export function deepCopy   (src: Array<Clonable>       ): Clonable[]             ;
  export function deepCopy   (src: Record<string,unknown>): Record<string,unknown> ;
  export function deepCopy<T>(src: T                     ): T                 ;
  export function deepCopy   (src: Clonable): typeof src {
    if      (isPrimitive (src)) { return src;         }
    else if (isDate        (src)) { return new Date(src.getTime()); }
    else if (isRegExp      (src)) { return new RegExp(src);         }
    else if (isArray       (src)) { return src.map(e => isPrimitive(e) ? e : deepCopy(e)); }
    else if (isObject      (src)) {
      // const srcRecord    = src as Record<string,unknown>;
      const result       = Object.create(null) as Record<string,unknown>;
      const srcPropDescs = Object.getOwnPropertyDescriptors(src);
      Object.getOwnPropertyNames(src).forEach(key => {
        const k = key as keyof typeof src;
        Object.defineProperty(result, k, srcPropDescs[k]);
        result[k] = isPrimitive(src[k]) ? src[k] : deepCopy(src[k]);
      });
      return result;
    }
    else { throw new TypeError("Unable to copy obj! Its type isn't supported."); }
  }
  export function assertExhaustive(
    _val: never,
    msg: string = 'Reached unexpected case in exhaustive switch'
  ): never {
    throw new TypeError(msg);
  }
}

export namespace path {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  export const {
    normalize,
    dirname,
    basename,
    extname,
    join,
    isAbsolute,
    resolve,
    sep,
    delimiter,
  } = path_;

  export function filename(p: string): string { return path_.parse(p).name; }
  export function normalizeShellArg(arg: string): string {
    arg = arg.trim();
    // Check if the arg is enclosed in backtick,
    // or includes unescaped double-quotes (or single-quotes on windows),
    // or includes unescaped single-quotes on mac and linux.
    if (/^`.*`$/g.test(arg) || /.*[^\\]".*/g.test(arg) ||
      (ext.isWindows && /.*[^\\]'.*/g.test(arg)) ||
      (!ext.isWindows && /.*[^\\]'.*/g.test(arg))) {
      return arg;
    }
    // The special character double-quote is already escaped in the arg.
    const unescapedSpaces: string | undefined = arg.split('').find((char, index) => index > 0 && char === " " && arg[index - 1] !== "\\");
    if (!unescapedSpaces && !ext.isWindows) {
      return arg;
    } else if (arg.includes(" ")) {
      arg = arg.replace(/\\\s/g, " ");
      return "\"" + arg + "\"";
    } else {
      return arg;
    }
  }
}

export namespace fs {
  export const stat      = promisify(fs_.stat);
  export const mkdir     = promisify(fs_.mkdir);
  export const readdir   = promisify(fs_.readdir);
  export const readFile  = promisify(fs_.readFile);
  export const writeFile = promisify(fs_.writeFile);
  export const exists    = promisify(fs_.exists);
  export const copyFile  = promisify(fs_.copyFile);
  export const unlink    = promisify(fs_.unlink);

  export async function tryStat   (filePath: fs_.PathLike): Promise<fs_.Stats|null> { return  await stat(filePath ).catch (_ => null);         }
  export async function fileExists(filePath: string      ): Promise<boolean>        { return (await tryStat(filePath))?.isFile()     ?? false; }
  export async function dirExists (dirPath:  string      ): Promise<boolean>        { return (await tryStat(dirPath))?.isDirectory() ?? false; }
  export async function createDir (dirPath:  string      )                          { return vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)); }
}
//========================================================================================================================
// #region Logging
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

// #endregion
//========================================================================================================================

export namespace ext {
  export const isWindows    = process_.platform === "win32";
  export const eolRegEx     = /\r?\n/;
  export const crlfString   = "\r\n";
  export const lfString     = "\n";
  export function eolToString            (eol: vscode.EndOfLine): string                   { return eol === vscode.EndOfLine.CRLF ? crlfString : lfString; }
  export function isExtensionActive      (extId: string): boolean                          { return vscode.extensions.getExtension(extId)?.isActive ?? false; }
  export function findWorkspaceFolder    (name:  string): vscode.WorkspaceFolder|undefined { return vscode.workspace.workspaceFolders?.find(wf => name.toLowerCase() === wf.name.toLowerCase()); }
  export function defaultWksFolder       ():              vscode.WorkspaceFolder|undefined { return vscode.workspace.workspaceFolders?.[0]; }
  export function defaultWksFolderPath   ():              string|undefined                 { const folder = defaultWksFolder(); return folder ? path.normalize(folder.uri.fsPath) : undefined; }

  // export type EnvVarsWithNull = Record<string, string | undefined | null>;
  export type EnvVars = Record<string, string | undefined>; // alias of NodeJS.ProcessEnv, Record<string, string | undefined> === Dict<string>
  type WksVars = {
    pathSeparator:           string | undefined;
    workspaceFolder:         string | undefined;
    workspaceFolderBasename: string | undefined;
    cwd:                     string | undefined;
    file:                    string | undefined;
    fileWorkspaceFolder:     string | undefined;
    relativeFile:            string | undefined;
    relativeFileDirname:     string | undefined;
    fileBasename:            string | undefined;
    fileExtname:             string | undefined;
    fileBasenameNoExtension: string | undefined;
    fileDirname:             string | undefined;
    lineNumber:              string | undefined;
    selectedText:            string | undefined;
  };
  export class VariableResolver {
    private readonly config:   vscode.WorkspaceConfiguration;
    private readonly envVars:  EnvVars;
    private readonly wksVars:  WksVars;
    constructor(ctxVars: Partial<WksVars> = {}, envVars: EnvVars = {}) {
      this.config         = vscode.workspace.getConfiguration();
      this.envVars        = Object.assign({}, process_.env, envVars);
      const dfltWksFolder = vscode.workspace.workspaceFolders?.[0];
      const dfltEditor    = vscode.window.activeTextEditor;
      const pathSeparator           = ctxVars.pathSeparator           ?? path.sep;
      const workspaceFolder         = ctxVars.workspaceFolder         ?? dfltWksFolder?.uri.fsPath;
      const workspaceFolderBasename = ctxVars.workspaceFolderBasename ?? dfltWksFolder?.name;
      const cwd                     = ctxVars.cwd                     ?? workspaceFolder;
      const file                    = ctxVars.file                    ?? dfltEditor?.document.uri.fsPath;
      const fileWorkspaceFolder     = ctxVars.fileWorkspaceFolder     ?? (file ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file))?.uri.fsPath : undefined);
      const relativeFile            = ctxVars.relativeFile            ?? (file ? vscode.workspace.asRelativePath(vscode.Uri.file(file)) : undefined);
      const relativeFileDirname     = ctxVars.relativeFileDirname     ?? (relativeFile ? path.dirname(relativeFile) : undefined);
      const fileBasename            = ctxVars.fileBasename            ?? (file ? path.basename(file) : undefined);
      const fileExtname             = ctxVars.fileExtname             ?? (fileBasename ? path.extname(fileBasename) : undefined);
      const fileBasenameNoExtension = ctxVars.fileBasenameNoExtension ?? (file ? path.extname(file) : undefined);
      const fileDirname             = ctxVars.fileDirname             ?? (file ? path.dirname(file) : undefined);
      const lineNumber              = ctxVars.lineNumber              ?? (dfltEditor ? (dfltEditor?.selection.start.line + 1).toString() : undefined);
      const selectedText            = ctxVars.selectedText            ?? dfltEditor?.document.getText(dfltEditor.selection);
      this.wksVars = {
        pathSeparator:           pathSeparator,
        workspaceFolder:         workspaceFolder,
        workspaceFolderBasename: workspaceFolderBasename,
        cwd:                     cwd,
        file:                    file,
        fileWorkspaceFolder:     fileWorkspaceFolder,
        relativeFile:            relativeFile,
        relativeFileDirname:     relativeFileDirname,
        fileBasename:            fileBasename,
        fileExtname:             fileExtname,
        fileBasenameNoExtension: fileBasenameNoExtension,
        fileDirname:             fileDirname,
        lineNumber:              lineNumber,
        selectedText:            selectedText,
      };
    }

    resolveVars(
      input: string,
      opt: {  relBasePath?: string; normalizePath?: boolean } = {}
    ): string {
      // Replace environment and configuration variables
      const varRegEx = /\$\{(?:(?<scope>.+):)?(?<name>.+)\}/g;
      // const varRegEx = /\$\{(?:(?<name>env|config|workspaceFolder|workspaceFolderBasename|file|fileWorkspaceFolder|relativeFile|relativeFileDirname|fileBasename|fileBasenameNoExtension|fileDirname|fileExtname|cwd|lineNumber|selectedText|pathSeparator)[.:])?(?<scope>.*?)\}/g;
      let ret = input.replace(varRegEx, (match: string, scope: string | undefined, name: string): string => {
        let newValue: string | undefined;
        switch (scope) {
          case "env":                     { newValue = this.envVars[name];                        break; }
          case "config":                  { newValue = this.config.get<string>(name);         break; }
          default: {
            switch (name) {
              case "workspaceFolder":         { newValue = this.wksVars.workspaceFolder;         break; }
              case "workspaceFolderBasename": { newValue = this.wksVars.workspaceFolderBasename; break; }
              case "cwd":                     { newValue = this.wksVars.cwd;                     break; }
              case "pathSeparator":           { newValue = this.wksVars.pathSeparator;           break; }
              case "file":                    { newValue = this.wksVars.file;                    break; }
              case "fileWorkspaceFolder":     { newValue = this.wksVars.fileWorkspaceFolder;     break; }
              case "relativeFile":            { newValue = this.wksVars.relativeFile;            break; }
              case "relativeFileDirname":     { newValue = this.wksVars.relativeFileDirname;     break; }
              case "fileBasename":            { newValue = this.wksVars.fileBasename;            break; }
              case "fileBasenameNoExtension": { newValue = this.wksVars.fileBasenameNoExtension; break; }
              case "fileDirname":             { newValue = this.wksVars.fileDirname;             break; }
              case "fileExtname":             { newValue = this.wksVars.fileExtname;             break; }
              case "lineNumber":              { newValue = this.wksVars.lineNumber;              break; }
              case "selectedText":            { newValue = this.wksVars.selectedText;            break; }
              default:                        { void vscode.window.showErrorMessage(`unknown variable to resolve: [match: ${match}, scope: ${scope ?? "undefined"}, name: ${name}]`); break; }
            }
          }
        }
        return newValue ?? match;
      });

      // Resolve '~' at the start of the path
      ret = ret.replace(/^~/g, (_match: string, _name: string) => os.homedir());
      if (opt.relBasePath)   {  ret = path.resolve(opt.relBasePath, ret);  }
      if (opt.normalizePath) {  ret = path.normalize(ret);  }
      return ret;
    }
  }

  export class ExtensionConfigBase<T> {
    protected _cfgData: T;
    get cfgData(): T { return this._cfgData; }

    constructor(
      protected section: string,
      protected scope?: vscode.ConfigurationScope | null,
      protected resolve?: (config: T) => void,
    ) {
      const rawConfig =  vscode.workspace.getConfiguration(undefined, this.scope).get<T>(this.section)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
      this._cfgData = types.deepCopy(rawConfig);
      if (this.resolve) { this.resolve(this._cfgData); }
    }
    public reload(): void {
      const rawConfig =  vscode.workspace.getConfiguration(undefined, this.scope).get<T>(this.section)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
      this._cfgData = types.deepCopy(rawConfig);
      if (this.resolve) { this.resolve(this._cfgData); }
    }

    // public getWithDefault<T>(section: string): T {
    //     const info: any = this.config.inspect<T>(section);
    //     if (info.workspaceFolderValue !== undefined) {
    //         return info.workspaceFolderValue;
    //     } else if (info.workspaceValue !== undefined) {
    //         return info.workspaceValue;
    //     } else if (info.globalValue !== undefined) {
    //         return info.globalValue;
    //     }
    //     return info.defaultValue;
    // }
    // protected getWithNullAsUndefined<T>(section: string): T | undefined {
    //     const result: T | undefined | null = this.config.get<T>(section);
    //     if (result === null) {
    //         return undefined;
    //     }
    //     return result;
    // }
    // public getWithUndefinedDefault<T>(section: string): T | undefined {
    //     const info: any = this.config.inspect<T>(section);
    //     if (info.workspaceFolderValue !== undefined) {
    //         return info.workspaceFolderValue;
    //     } else if (info.workspaceValue !== undefined) {
    //         return info.workspaceValue;
    //     } else if (info.globalValue !== undefined) {
    //         return info.globalValue;
    //     }
    //     return undefined;
    // }
    // public getEnum<T>(section: string): T {
    //     let configVal = this.config.get<string>(section);
    //     type BuildStepKeys = keyof typeof BuildStep; // Equiv to: type BuildStepKeys = 'buildFile' | 'buildExe' | 'buildLib' | 'buildObj';
    //     type BuildStepMap = { [P in BuildStepKeys]: number; }; // will have strongly typed keys
    //     declare const color: BuildStep;
    //     declare const buildStepMap: BuildStepMap;
    //     return buildStepMap[configVal];
    // }
  }
}

export interface Lazy<T> {
  value: T;
  hasValue: boolean;
  map<R>(f: (x: T) => R): Lazy<R>;
}

class LazyValue<T> implements Lazy<T> {
  private _hasValue: boolean = false;
  private _value?: T;

  constructor(
    private readonly _getValue: () => T
  ) { }

  get value(): T {
    if (!this._hasValue) {
      this._hasValue = true;
      this._value = this._getValue();
    }
    return this._value!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
  }

  get hasValue(): boolean {
    return this._hasValue;
  }

  public map<R>(f: (x: T) => R): Lazy<R> {
    return new LazyValue(() => f(this.value));
  }
}

export function lazy<T>(getValue: () => T): Lazy<T> {
  return new LazyValue<T>(getValue);
}


export namespace cp {
  export const execFile = promisify(cp_.execFile);

  // A promise for running process and also a wrapper to access ChildProcess-like methods
  export interface ProcessRunOptions {
    shellArgs?:          string[];               // Any arguments
    cwd?:                string;                 // Current working directory
    logger?:             Logger;                 // Shows a message if an error occurs (in particular the command not being found), instead of rejecting. If this happens, the promise never resolves
    onStart?:            () => void;             // Called after the process successfully starts
    onStdout?:           (data: string) => void; // Called when data is sent to stdout
    onStderr?:           (data: string) => void; // Called when data is sent to stderr
    onExit?:             () => void;             // Called after the command (successfully or unsuccessfully) exits
    notFoundText?:       string;                 // Text to add when command is not found (maybe helping how to install)
  }

  export type ProcessRun = {
    procCmd:      string;
    childProcess: cp_.ChildProcess | undefined;
    isRunning:    () => boolean;
    kill:         () => void;
    completion:   Promise<{ stdout: string; stderr: string }>;
  };

  export interface ProcRunException extends cp_.ExecException {
    stdout?: string|undefined;
    stderr?: string|undefined;
  }
  // Spawns cancellable process
  export function runProcess(cmd: string, options: ProcessRunOptions = {}): ProcessRun {
    let firstResponse = true;
    let wasKilledbyUs = false;
    let isRunning     = true;
    let childProcess: cp_.ChildProcess | undefined;

    const procCmd = [cmd]
      .concat(options.shellArgs ?? [])
      .map(arg => path.normalizeShellArg(arg))
      .join(' ');
    return {
      procCmd:      procCmd,
      childProcess: childProcess,
      isRunning:    () => isRunning,
      kill:         () => {
        if (!(childProcess?.pid)) { return; }
          wasKilledbyUs = true;
          if (ext.isWindows) { cp_.spawn('taskkill', ['/pid', childProcess.pid.toString(), '/f', '/t']); }
          else               { childProcess.kill('SIGINT'); }
      },
      completion: new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        childProcess = cp_.exec(
          procCmd,
          { cwd: options.cwd }, // options.cwd ?? vscode.workspace.workspaceFolders?.[0].uri.fsPath,
          (error: cp_.ExecException | null, stdout: string, stderr: string): void => {
            isRunning = false;
            if (options.onExit) { options.onExit(); }
            childProcess = undefined;
            if (wasKilledbyUs || !error) {
              resolve({ stdout, stderr });
            } else {
              if (options.logger) {
                const cmdName = cmd.split(' ', 1)[0];
                const cmdWasNotFound = ext.isWindows
                  ? error.message.includes(`'${cmdName}' is not recognized`)
                  : error?.code === 127;
                options.logger.error(
                  cmdWasNotFound
                    ? (options.notFoundText ?? `${cmdName} is not available in your path;`)
                    : error.message
                );
              }
              reject(Object.assign(
                (error ?? { name: "RunException", message: "Unknown" }) as ProcRunException,
                { stdout: stdout, stderr: stderr }
              ));
            }
          },
        );
        childProcess.stdout?.on('data', (data: Buffer) => {
          if (firstResponse && options.onStart) { options.onStart(); }
          firstResponse = false;
          if (options.onStdout) { options.onStdout(data.toString()); }
        });
        childProcess.stderr?.on('data', (data: Buffer) => {
          if (firstResponse && options.onStart) { options.onStart(); }
          firstResponse = false;
          if (options.onStderr) { options.onStderr(data.toString()); }
        });
      }),
    };
  }

}