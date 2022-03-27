'use strict';
import * as vscode from "vscode";
import * as os from 'os';
import * as process_ from 'process';
import * as path_ from 'path';
import * as fs_ from 'fs';
import * as cp from 'child_process';
import { promisify } from 'util';

// Common helper functions
export namespace types {
  export function isUndefined         (o: unknown): o is undefined      { return (typeof o === 'undefined');                                          }
  export function isNull              (o: unknown): o is null           { return o === null;                                                          }
  export function isNullOrUndefined   (o: unknown): o is undefined|null { return (isUndefined(o) || o === null);                                      }
  export function isSymbol            (o: unknown): o is symbol         { return typeof o === 'symbol'  || o instanceof Symbol;                       }
  export function isBoolean           (o: unknown): o is boolean        { return (o === true || o === false);                                         }
  export function isNumber            (o: unknown): o is number         { return typeof o === "number"  || o instanceof Number;                       }
  export function isString            (o: unknown): o is string         { return typeof o === "string"  || o instanceof String;                       }
  export function isArray<T>          (o: unknown): o is T[]            { return Array.isArray(o);                                                    }
  export function isObject            (o: unknown): o is Object         { return (typeof o === 'object') && o !== null && !Array.isArray(o) && !(o instanceof RegExp) && !(o instanceof Date); } // eslint-disable-line @typescript-eslint/ban-types
  export function isFunction          (o: unknown): o is Function       { return (typeof o === 'function');                                             } // eslint-disable-line @typescript-eslint/ban-types
  export function isScalarValue       (o: unknown): boolean             { return isNullOrUndefined(o) || isBoolean (o) || isNumber(o) || isString(o); }
  export function isStringArray       (o: unknown): o is string[]       { return Array.isArray(o) && (<unknown[]>o).every(e => isString(e)); }
  export function isBlankString       (o: string ): boolean             { return o.length === 0 || /\S/g.test(o) === false;                           }
}

export namespace path {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  export const {
    normalize,
    dirname,
    basename,
    extname,
    parse,
    join,
    isAbsolute,
    sep,
  } = path_;

  // export const pathNormalize  = path_.normalize;
  // export const dirname    = path_.dirname;
  // export const basename   = path_.basename;
  // export const extname    = path_.extname;
  // export const parse      = path_.parse;
  // export const sep        = path_.sep;
  export function normalizeShellArg(arg: string): string {
    arg = arg.trimStart().trimEnd();
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
  export const stat = promisify(fs_.stat);
  export const mkdir = promisify(fs_.mkdir);
  export async function tryStat   (filePath: fs_.PathLike): Promise<fs_.Stats|null> { return  await stat(filePath ).catch (_ => null);         }
  export async function fileExists(filePath: string      ): Promise<boolean>        { return (await tryStat(filePath))?.isFile()     ?? false; }
  export async function dirExists (dirPath:  string      ): Promise<boolean>        { return (await tryStat(dirPath))?.isDirectory() ?? false; }
  export async function createDir (dirPath:  string      )                          { return vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)); }
}

export namespace log {
  export function info  (chan: vscode.OutputChannel, msg: string, showMsg: boolean = false): void { chan.appendLine(msg); if (showMsg) { void vscode.window.showInformationMessage(msg); } }
  export function warn  (chan: vscode.OutputChannel, msg: string, showMsg: boolean = true ): void { chan.appendLine(msg); if (showMsg) { void vscode.window.showWarningMessage(msg);     } }
  export function error (chan: vscode.OutputChannel, msg: string, showMsg: boolean = true ): void { chan.appendLine(msg); if (showMsg) { void vscode.window.showErrorMessage(msg);       } }
}

export namespace ext {
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
    varCtx.fileBasenameNoExtension = varCtx.fileBasenameNoExtension ?? (varCtx.file ? path.parse(varCtx.file).ext : undefined);
    varCtx.fileDirname             = varCtx.fileDirname             ?? (varCtx.file ? path.dirname(varCtx.file) : undefined);
    varCtx.cwd                     = varCtx.cwd                     ?? varCtx.fileDirname;
    varCtx.lineNumber              = varCtx.lineNumber              ?? (activeEditor ? (activeEditor?.selection.start.line + 1).toString() : undefined);
    varCtx.selectedText            = varCtx.selectedText            ?? activeEditor?.document.getText(activeEditor.selection);
    varCtx.execPath                = varCtx.execPath                ?? proc.execPath;
    varCtx.pathSeparator           = varCtx.pathSeparator           ?? path.sep;

    // Replace environment and configuration variables.
    const varRegEx = /\$\{((env|config|workspaceFolder|workspaceFolderBasename|file|fileWorkspaceFolder|relativeFile|relativeFileDirname|fileBasename|fileBasenameNoExtension|fileDirname|fileExtname|cwd|lineNumber|selectedText|execPath|pathSeparator)(\.|:))?(.*?)\}/g;
    let ret: string = input;
    const cycleCache: Set<string> = new Set();
    while (!cycleCache.has(ret)) {
      cycleCache.add(ret);
      ret = ret.replace(varRegEx, (match: string, _1: string, varType: string, _3: string, name: string) => {
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
    }

    // Resolve '~' at the start of the path
    ret = ret.replace(/^~/g, (_match: string, _name: string) => os.homedir());
    return ret;
  }

  export class ExtensionConfigBase {
    private readonly config: vscode.WorkspaceConfiguration;
    constructor(section: string, public resource?: vscode.Uri) {
      this.config = vscode.workspace.getConfiguration(section, resource ? resource : null);
    }

    public fallbackGet<T>(section: string, defaultValue: T): T {
      return this.config.get<T>(section, defaultValue);
    }
    public resolvedGet<T>(section: string, defaultVal: T): string | T {
      const configVal = this.config.get<string>(section);
      return configVal ? resolveVariables(configVal) : defaultVal;
    }
    public resolvedArray(section: string): string[] {
      return this.config.get<string[]>(section, []).map(configVal => resolveVariables(configVal));
    }
    public resolvedPath<T>(section: string, defaultVal: T): string | T {
      const configVal = this.config.get<string>(section);
      return configVal ? path.normalize(resolveVariables(configVal)) : defaultVal;
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
  export const isWindows    = platform.includes("win");
  export const envDelimiter = isWindows ? ";" : ":";

  // A promise for running process and also a wrapper to access ChildProcess-like methods
  export interface ProcessRunOptions {
    shellArgs?:          string[];               // Any arguments
    cwd?:                string;                 // Current working directory
    showMessageOnError?: boolean;                // Shows a message if an error occurs (in particular the command not being found), instead of rejecting. If this happens, the promise never resolves
    onStart?:            () => void;             // Called after the process successfully starts
    onStdout?:           (data: string) => void; // Called when data is sent to stdout
    onStderr?:           (data: string) => void; // Called when data is sent to stderr
    onExit?:             () => void;             // Called after the command (successfully or unsuccessfully) exits
    notFoundText?:       string;                 // Text to add when command is not found (maybe helping how to install)
  }

  export type ProcessRun = {
    procCmd: string;
    childProcess: cp.ChildProcess | undefined;
    isRunning:    () => boolean;
    kill: () => void;
    completion: Promise<{ stdout: string; stderr: string }>;
  };

  // Spawns cancellable process
  export function runProcess(cmd: string, options: ProcessRunOptions = {}): ProcessRun {
    let firstResponse = true;
    let wasKilledbyUs = false;
    let isRunning     = true;
    let childProcess: cp.ChildProcess | undefined;

    const procCmd = [cmd]
      .concat(options.shellArgs ?? [])
      .map(arg => path.normalizeShellArg(arg))
      .join(' ');
    return <ProcessRun>{
      procCmd: procCmd,
        childProcess: childProcess,
        isRunning: () => isRunning,
      kill: () => {
        if (!childProcess || !childProcess.pid) { return; }
          wasKilledbyUs = true;
          if (isWindows) { cp.spawn('taskkill', ['/pid', childProcess.pid.toString(), '/f', '/t']); }
          else           { childProcess.kill('SIGINT'); }
      },
      completion: new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        childProcess = cp.exec(
          procCmd,
          <cp.ExecOptions>{
            cwd: options.cwd, // options.cwd ?? vscode.workspace.workspaceFolders?.[0].uri.fsPath,
          },
          (error: cp.ExecException | null, stdout: string, stderr: string): void => {
            isRunning = false;
            if (options.onExit) { options.onExit(); }
            childProcess = undefined;
            if (wasKilledbyUs || !error) {
              resolve({ stdout, stderr });
            } else {
              if (options.showMessageOnError) {
                const cmdName = cmd.split(' ', 1)[0];
                const cmdWasNotFound = isWindows
                  ? error.message.includes(`'${cmdName}' is not recognized`)
                  : error?.code === 127;
                void vscode.window.showErrorMessage(
                  cmdWasNotFound
                    ? `${cmdName} is not available in your path; ${options.notFoundText ?? ""}`
                    : error.message
                );
              }
              reject(Object.assign(error, {stdout: stdout, stderr: stderr}));
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