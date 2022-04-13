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
    sep,
  } = path_;

  export function filename(p: string): string { return path_.parse(p).name; }
  export function normalizeShellArg(arg: string): string {
    arg = arg.trim();
    // Check if the arg is enclosed in backtick,
    // or includes unescaped double-quotes (or single-quotes on windows),
    // or includes unescaped single-quotes on mac and linux.
    if (/^`.*`$/g.test(arg) || /.*[^\\]".*/g.test(arg) ||
      (proc.isWindows && /.*[^\\]'.*/g.test(arg)) ||
      (!proc.isWindows && /.*[^\\]'.*/g.test(arg))) {
      return arg;
    }
    // The special character double-quote is already escaped in the arg.
    const unescapedSpaces: string | undefined = arg.split('').find((char, index) => index > 0 && char === " " && arg[index - 1] !== "\\");
    if (!unescapedSpaces && !proc.isWindows) {
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

export namespace log {
  export enum LogLevel {
    off     = -1,
    error   = 0,
    warn    = 1,
    info    = 2,
    trace   = 3,
  }

  export type LogLevelKey = 'off' | 'error' | 'warn' | 'info' | 'trace';
  export function strToLogLevel(levelStr: LogLevelKey): LogLevel {
    switch (levelStr) {
      case 'off':     return LogLevel.off;
      case 'error':   return LogLevel.error;
      case 'warn':    return LogLevel.warn;
      case 'info':    return LogLevel.info;
      case 'trace':   return LogLevel.trace;
    }
  }
  export interface LogItem {
    level:  LogLevel;
    msg:    string;
    err:    Error | unknown | null;
    reveal: boolean;
  }
  export interface LogWriter {
    append(msg: string): void;
    clear(): void;
  }
  export interface Logger extends LogWriter {
    maxLogLevel : LogLevel;
    log   (item: LogItem): void;
    error (msg: string, err?: Error | unknown | null, reveal?: boolean): void;
    warn  (msg: string, reveal?: boolean): void;
    info  (msg: string, reveal?: boolean): void;
    trace (msg: string, reveal?: boolean): void;
  }
  const logImp = (writer: LogWriter, maxLogLevel : LogLevel, item: LogItem):void  => {
    if (item.level > maxLogLevel) { return; }
    writer.append(item.msg + os.EOL);
    if (item.err) {
      const errMsg   = types.isNativeError(item.err) ? item.err.message : String(item.err);
      const errStack = types.isNativeError(item.err) ? item.err.stack   : null;
      writer.append(`  Error: ${errMsg}\n`);
      if (errStack) {  writer.append(`  StackTrace: ${errStack}\n`); }
    }
    switch(item.reveal ? item.level : LogLevel.off) {
      case LogLevel.off:     break;
      case LogLevel.error:   void vscode.window.showErrorMessage       (item.msg); break;
      case LogLevel.warn:    void vscode.window.showWarningMessage     (item.msg); break;
      case LogLevel.info:    void vscode.window.showInformationMessage (item.msg); break;
      case LogLevel.trace:   void vscode.window.showInformationMessage (item.msg); break;
    }
  };
  export function makeChannelLogger(maxLogLevel: LogLevel, chan: vscode.OutputChannel): Logger {
    return <Logger>{
      append:      msg => chan.append(msg),
      clear:       () => chan.clear(),
      maxLogLevel: maxLogLevel,
      log:         function (item: LogItem):                                             void { logImp(this, this.maxLogLevel, item); },
      error:       function (msg:  string, err?: Error|unknown|null, reveal?: boolean ): void { this.log(<LogItem>{level: LogLevel.error , msg: msg, reveal: reveal ?? true  , err: err ?? null}); },
      warn:        function (msg:  string,                           reveal?: boolean ): void { this.log(<LogItem>{level: LogLevel.warn  , msg: msg, reveal: reveal ?? true  , err:        null}); },
      info:        function (msg:  string,                           reveal?: boolean ): void { this.log(<LogItem>{level: LogLevel.info  , msg: msg, reveal: reveal ?? false , err:        null}); },
      trace:       function (msg:  string,                           reveal?: boolean ): void { this.log(<LogItem>{level: LogLevel.trace , msg: msg, reveal: reveal ?? false , err:        null}); },
    };
  }
}

export namespace ext {
  export const eolRegEx   = /\r?\n/;
  export const crlfString = "\r\n";
  export const lfString   = "\n";
  export function eolToString            (eol: vscode.EndOfLine): string                   { return eol === vscode.EndOfLine.CRLF ? crlfString : lfString; }
  export function isExtensionActive      (extId: string): boolean                          { return vscode.extensions.getExtension(extId)?.isActive ?? false; }
  export function findWorkspaceFolder    (name:  string): vscode.WorkspaceFolder|undefined { return vscode.workspace.workspaceFolders?.find(wf => name.toLowerCase() === wf.name.toLowerCase()); }
  export function defaultWksFolder       ():              vscode.WorkspaceFolder|undefined { return vscode.workspace.workspaceFolders?.[0]; }
  export function defaultWksFolderPath   ():              string|undefined                 { const folder = defaultWksFolder(); return folder ? path.normalize(folder.uri.fsPath) : undefined; }
  // export type Environment = Record<string, string | undefined>; // alias of NodeJS.ProcessEnv, Record<string, string | undefined> === Dict<string>
  // export type EnvironmentWithNull = Record<string, string | undefined | null>;

  export interface VariableContext {
    workspaceFolder?:         string | undefined;
    workspaceFolderBasename?: string | undefined;
    file?:                    string | undefined;
    fileWorkspaceFolder?:     string | undefined;
    relativeFile?:            string | undefined;
    relativeFileDirname?:     string | undefined;
    fileBasename?:            string | undefined;
    fileExtname?:             string | undefined;
    fileBasenameNoExtension?: string | undefined;
    fileDirname?:             string | undefined;
    cwd?:                     string | undefined;
    lineNumber?:              string | undefined;
    selectedText?:            string | undefined;
    execPath?:                string | undefined;
    pathSeparator?:           string | undefined;
    [key: string]:            string | undefined;
  }
  export function resolveVariables(input: string, baseContext?: VariableContext): string {
    if (!input) { return ""; }
    const config           = vscode.workspace.getConfiguration();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const activeEditor     = vscode.window.activeTextEditor;

    const varCtx: VariableContext = baseContext
      ? Object.assign({}, baseContext)
      : {};
    varCtx.workspaceFolder         = varCtx.workspaceFolder         ?? workspaceFolders?.[0].uri.fsPath;
    varCtx.workspaceFolderBasename = varCtx.workspaceFolderBasename ?? workspaceFolders?.[0].name;
    varCtx.file                    = varCtx.file                    ?? activeEditor?.document.uri.fsPath;
    varCtx.fileWorkspaceFolder     = varCtx.fileWorkspaceFolder     ?? (varCtx.file ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(varCtx.file))?.uri.fsPath : undefined);
    varCtx.relativeFile            = varCtx.relativeFile            ?? (varCtx.file ? vscode.workspace.asRelativePath(vscode.Uri.file(varCtx.file)) : undefined);
    varCtx.relativeFileDirname     = varCtx.relativeFileDirname     ?? (varCtx.relativeFile ? path.dirname(varCtx.relativeFile) : undefined);
    varCtx.fileBasename            = varCtx.fileBasename            ?? (varCtx.file ? path.basename(varCtx.file) : undefined);
    varCtx.fileExtname             = varCtx.fileExtname             ?? (varCtx.fileBasename ? path.extname(varCtx.fileBasename) : undefined);
    varCtx.fileBasenameNoExtension = varCtx.fileBasenameNoExtension ?? (varCtx.file ? path.extname(varCtx.file) : undefined);
    varCtx.fileDirname             = varCtx.fileDirname             ?? (varCtx.file ? path.dirname(varCtx.file) : undefined);
    varCtx.cwd                     = varCtx.cwd                     ?? varCtx.fileDirname;
    varCtx.lineNumber              = varCtx.lineNumber              ?? (activeEditor ? (activeEditor?.selection.start.line + 1).toString() : undefined);
    varCtx.selectedText            = varCtx.selectedText            ?? activeEditor?.document.getText(activeEditor.selection);
    varCtx.execPath                = varCtx.execPath                ?? proc.execPath;
    varCtx.pathSeparator           = varCtx.pathSeparator           ?? path.sep;

    // Replace environment and configuration variables.
    const varRegEx = /\$\{((env|config|workspaceFolder|workspaceFolderBasename|file|fileWorkspaceFolder|relativeFile|relativeFileDirname|fileBasename|fileBasenameNoExtension|fileDirname|fileExtname|cwd|lineNumber|selectedText|execPath|pathSeparator)(\.|:))?(.*?)\}/g;
    let ret = input.replace(varRegEx, (match: string, _1: string, varType: string, _3: string, name: string): string => {
      let newValue: string | undefined;
      switch (varType) {
        case "env":                     { newValue = varCtx[name] ?? proc.env[name];        break; }
        case "config":                  { newValue = config.get<string>(name);              break; }
        case "workspaceFolder":         { newValue = findWorkspaceFolder(name)?.uri.fsPath; break; }
        case "workspaceFolderBasename": { newValue = findWorkspaceFolder(name)?.name;       break; }
        default: {
          switch (name) {
            case "workspaceFolder":         { newValue = varCtx.workspaceFolder;         break; }
            case "workspaceFolderBasename": { newValue = varCtx.workspaceFolderBasename; break; }
            case "file":                    { newValue = varCtx[name];                   break; }
            case "fileWorkspaceFolder":     { newValue = varCtx[name];                   break; }
            case "relativeFile":            { newValue = varCtx[name];                   break; }
            case "relativeFileDirname":     { newValue = varCtx[name];                   break; }
            case "fileBasename":            { newValue = varCtx[name];                   break; }
            case "fileBasenameNoExtension": { newValue = varCtx[name];                   break; }
            case "fileDirname":             { newValue = varCtx[name];                   break; }
            case "fileExtname":             { newValue = varCtx[name];                   break; }
            case "cwd":                     { newValue = varCtx[name];                   break; }
            case "lineNumber":              { newValue = varCtx[name];                   break; }
            case "selectedText":            { newValue = varCtx[name];                   break; }
            case "execPath":                { newValue = varCtx[name];                   break; }
            case "pathSeparator":           { newValue = varCtx[name];                   break; }
            default:                        { void vscode.window.showErrorMessage(`unknown variable to resolve: [match: ${match},_1: ${_1},varType: ${varType},_3: ${_3},name: ${name}]`); break; }
          }
        }
      }
      return newValue ?? match;
    });

    // Resolve '~' at the start of the path
    ret = ret.replace(/^~/g, (_match: string, _name: string) => os.homedir());
    return ret;
  }

  export function resolveArrayVars (input: string[]): string[] { return input.map(configVal => resolveVariables(configVal)); }
  export function resolvePath      (input: string  ): string   { return path.normalize(resolveVariables(input)); }
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

export namespace proc {
  export const { execPath, env, platform } = process_;
  export const isWindows    = process_.platform === "win32";
  export const envDelimiter = isWindows ? ";" : ":";
  export const execFile = promisify(cp_.execFile);

  // A promise for running process and also a wrapper to access ChildProcess-like methods
  export interface ProcessRunOptions {
    shellArgs?:          string[];               // Any arguments
    cwd?:                string;                 // Current working directory
    logger?:             log.Logger;                // Shows a message if an error occurs (in particular the command not being found), instead of rejecting. If this happens, the promise never resolves
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
    return <ProcessRun>{
      procCmd:      procCmd,
      childProcess: childProcess,
      isRunning:    () => isRunning,
      kill:         () => {
        if (!(childProcess?.pid)) { return; }
          wasKilledbyUs = true;
          if (isWindows) { cp_.spawn('taskkill', ['/pid', childProcess.pid.toString(), '/f', '/t']); }
          else           { childProcess.kill('SIGINT'); }
      },
      completion: new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        childProcess = cp_.exec(
          procCmd,
          <cp_.ExecOptions>{
            cwd: options.cwd, // options.cwd ?? vscode.workspace.workspaceFolders?.[0].uri.fsPath,
          },
          (error: cp_.ExecException | null, stdout: string, stderr: string): void => {
            isRunning = false;
            if (options.onExit) { options.onExit(); }
            childProcess = undefined;
            if (wasKilledbyUs || !error) {
              resolve({ stdout, stderr });
            } else {
              if (options.logger) {
                const cmdName = cmd.split(' ', 1)[0];
                const cmdWasNotFound = isWindows
                  ? error.message.includes(`'${cmdName}' is not recognized`)
                  : error?.code === 127;
                options.logger.error(
                  cmdWasNotFound
                    ? (options.notFoundText ?? `${cmdName} is not available in your path;`)
                    : error.message
                );
              }
              reject(Object.assign(
                <ProcRunException>(error ?? { name: "RunException", message: "Unknown" }),
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