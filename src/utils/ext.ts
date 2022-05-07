'use strict';
import * as vscode from 'vscode';
import * as process_ from 'process';
import * as os from 'os';
import * as cp_ from 'child_process';
import { path, objects } from '../utils/common';
import type { Logger } from './logger';


export const isWindows = process_.platform === "win32";

export function isExtensionActive   (extId: string): boolean                            { return vscode.extensions.getExtension(extId)?.isActive ?? false; }
export function findWorkspaceFolder (name: string):  vscode.WorkspaceFolder | undefined { return vscode.workspace.workspaceFolders?.find(wf => name.toLowerCase() === wf.name.toLowerCase()); }
export function defaultWksFolder    ():              vscode.WorkspaceFolder | undefined { return vscode.workspace.workspaceFolders?.[0]; }
export function defaultWksFolderPath():              string | undefined                 { const folder = defaultWksFolder(); return folder ? path.normalize(folder.uri.fsPath) : undefined; }

// export type EnvVarsWithNull = Record<string, string | undefined | null>;
export type EnvVars = Record<string, string | undefined>; // alias of NodeJS.ProcessEnv, Record<string, string | undefined> === Dict<string>
type WksVars = {
  pathSeparator: string | undefined;
  workspaceFolder: string | undefined;
  workspaceFolderBasename: string | undefined;
  cwd: string | undefined;
  file: string | undefined;
  fileWorkspaceFolder: string | undefined;
  relativeFile: string | undefined;
  relativeFileDirname: string | undefined;
  fileBasename: string | undefined;
  fileExtname: string | undefined;
  fileBasenameNoExtension: string | undefined;
  fileDirname: string | undefined;
  lineNumber: string | undefined;
  selectedText: string | undefined;
};
export class VariableResolver {
  private readonly config: vscode.WorkspaceConfiguration;
  private readonly envVars: EnvVars;
  private readonly wksVars: WksVars;
  constructor(ctxVars: Partial<WksVars> = {}, envVars: EnvVars = {}) {
    this.config = vscode.workspace.getConfiguration();
    this.envVars = Object.assign({}, process_.env, envVars);
    const dfltWksFolder = vscode.workspace.workspaceFolders?.[0];
    const dfltEditor = vscode.window.activeTextEditor;
    const pathSeparator = ctxVars.pathSeparator ?? path.sep;
    const workspaceFolder = ctxVars.workspaceFolder ?? dfltWksFolder?.uri.fsPath;
    const workspaceFolderBasename = ctxVars.workspaceFolderBasename ?? dfltWksFolder?.name;
    const cwd = ctxVars.cwd ?? workspaceFolder;
    const file = ctxVars.file ?? dfltEditor?.document.uri.fsPath;
    const fileWorkspaceFolder = ctxVars.fileWorkspaceFolder ?? (file ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file))?.uri.fsPath : undefined);
    const relativeFile = ctxVars.relativeFile ?? (file ? vscode.workspace.asRelativePath(vscode.Uri.file(file)) : undefined);
    const relativeFileDirname = ctxVars.relativeFileDirname ?? (relativeFile ? path.dirname(relativeFile) : undefined);
    const fileBasename = ctxVars.fileBasename ?? (file ? path.basename(file) : undefined);
    const fileExtname = ctxVars.fileExtname ?? (fileBasename ? path.extname(fileBasename) : undefined);
    const fileBasenameNoExtension = ctxVars.fileBasenameNoExtension ?? (file ? path.extname(file) : undefined);
    const fileDirname = ctxVars.fileDirname ?? (file ? path.dirname(file) : undefined);
    const lineNumber = ctxVars.lineNumber ?? (dfltEditor ? (dfltEditor?.selection.start.line + 1).toString() : undefined);
    const selectedText = ctxVars.selectedText ?? dfltEditor?.document.getText(dfltEditor.selection);
    this.wksVars = {
      pathSeparator: pathSeparator,
      workspaceFolder: workspaceFolder,
      workspaceFolderBasename: workspaceFolderBasename,
      cwd: cwd,
      file: file,
      fileWorkspaceFolder: fileWorkspaceFolder,
      relativeFile: relativeFile,
      relativeFileDirname: relativeFileDirname,
      fileBasename: fileBasename,
      fileExtname: fileExtname,
      fileBasenameNoExtension: fileBasenameNoExtension,
      fileDirname: fileDirname,
      lineNumber: lineNumber,
      selectedText: selectedText,
    };
  }

  resolveVars(
    input: string,
    opt: { relBasePath?: string; normalizePath?: boolean } = {}
  ): string {
    // Replace environment and configuration variables
    const varRegEx = /\$\{(?:(?<scope>.+):)?(?<name>.+)\}/g;
    // const varRegEx = /\$\{(?:(?<name>env|config|workspaceFolder|workspaceFolderBasename|file|fileWorkspaceFolder|relativeFile|relativeFileDirname|fileBasename|fileBasenameNoExtension|fileDirname|fileExtname|cwd|lineNumber|selectedText|pathSeparator)[.:])?(?<scope>.*?)\}/g;
    let ret = input.replace(varRegEx, (match: string, scope: string | undefined, name: string): string => {
      let newValue: string | undefined;
      switch (scope) {
        case "env": { newValue = this.envVars[name]; break; }
        case "config": { newValue = this.config.get<string>(name); break; }
        default: {
          switch (name) {
            case "workspaceFolder": { newValue = this.wksVars.workspaceFolder; break; }
            case "workspaceFolderBasename": { newValue = this.wksVars.workspaceFolderBasename; break; }
            case "cwd": { newValue = this.wksVars.cwd; break; }
            case "pathSeparator": { newValue = this.wksVars.pathSeparator; break; }
            case "file": { newValue = this.wksVars.file; break; }
            case "fileWorkspaceFolder": { newValue = this.wksVars.fileWorkspaceFolder; break; }
            case "relativeFile": { newValue = this.wksVars.relativeFile; break; }
            case "relativeFileDirname": { newValue = this.wksVars.relativeFileDirname; break; }
            case "fileBasename": { newValue = this.wksVars.fileBasename; break; }
            case "fileBasenameNoExtension": { newValue = this.wksVars.fileBasenameNoExtension; break; }
            case "fileDirname": { newValue = this.wksVars.fileDirname; break; }
            case "fileExtname": { newValue = this.wksVars.fileExtname; break; }
            case "lineNumber": { newValue = this.wksVars.lineNumber; break; }
            case "selectedText": { newValue = this.wksVars.selectedText; break; }
            default: { void vscode.window.showErrorMessage(`unknown variable to resolve: [match: ${match}, scope: ${scope ?? "undefined"}, name: ${name}]`); break; }
          }
        }
      }
      return newValue ?? match;
    });

    // Resolve '~' at the start of the path
    ret = ret.replace(/^~/g, (_match: string, _name: string) => os.homedir());
    if (opt.relBasePath) { ret = path.resolve(opt.relBasePath, ret); }
    if (opt.normalizePath) { ret = path.normalize(ret); }
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
    const rawConfig = vscode.workspace.getConfiguration(undefined, this.scope).get<T>(this.section)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    this._cfgData = objects.deepCopy(rawConfig);
    if (this.resolve) { this.resolve(this._cfgData); }
  }
  public reload(): void {
    const rawConfig = vscode.workspace.getConfiguration(undefined, this.scope).get<T>(this.section)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    this._cfgData = objects.deepCopy(rawConfig);
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


export function normalizeShellArg(arg: string): string {
  arg = arg.trim();
  // Check if the arg is enclosed in backtick,
  // or includes unescaped double-quotes (or single-quotes on windows),
  // or includes unescaped single-quotes on mac and linux.
  if (/^`.*`$/g.test(arg) || /.*[^\\]".*/g.test(arg) ||
    (isWindows && /.*[^\\]'.*/g.test(arg)) ||
    (!isWindows && /.*[^\\]'.*/g.test(arg))) {
    return arg;
  }
  // The special character double-quote is already escaped in the arg.
  const unescapedSpaces: string | undefined = arg.split('').find((char, index) => index > 0 && char === " " && arg[index - 1] !== "\\");
  if (!unescapedSpaces && !isWindows) {
    return arg;
  } else if (arg.includes(" ")) {
    arg = arg.replace(/\\\s/g, " ");
    return "\"" + arg + "\"";
  } else {
    return arg;
  }
}


// A promise for running process and also a wrapper to access ChildProcess-like methods
export interface ProcessRunOptions {
  shellArgs?: string[];               // Any arguments
  cwd?: string;                 // Current working directory
  logger?: Logger;                 // Shows a message if an error occurs (in particular the command not being found), instead of rejecting. If this happens, the promise never resolves
  onStart?: () => void;             // Called after the process successfully starts
  onStdout?: (data: string) => void; // Called when data is sent to stdout
  onStderr?: (data: string) => void; // Called when data is sent to stderr
  onExit?: () => void;             // Called after the command (successfully or unsuccessfully) exits
  notFoundText?: string;                 // Text to add when command is not found (maybe helping how to install)
}
export type ProcessRun = {
  procCmd: string;
  childProcess: cp_.ChildProcess | undefined;
  isRunning: () => boolean;
  kill: () => void;
  completion: Promise<{ stdout: string; stderr: string }>;
};
export interface ProcRunException extends cp_.ExecException {
  stdout?: string | undefined;
  stderr?: string | undefined;
}
// Spawns cancellable process
export function runProcess(cmd: string, options: ProcessRunOptions = {}): ProcessRun {
  let firstResponse = true;
  let wasKilledbyUs = false;
  let isRunning = true;
  let childProcess: cp_.ChildProcess | undefined;
  const procCmd = [cmd]
    .concat(options.shellArgs ?? [])
    .map(arg => normalizeShellArg(arg))
    .join(' ');
  return {
    procCmd: procCmd,
    childProcess: childProcess,
    isRunning: () => isRunning,
    kill: () => {
      if (!(childProcess?.pid)) { return; }
      wasKilledbyUs = true;
      if (isWindows) { cp_.spawn('taskkill', ['/pid', childProcess.pid.toString(), '/f', '/t']); }
      else { childProcess.kill('SIGINT'); }
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

export function once<T extends (...args: unknown[]) => unknown>(
  fn: (...args: Parameters<T>) => ReturnType<T>
): (...args: Parameters<T>) => ReturnType<T> {
  // export function once(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown {
  let didCall = false;
  let result: ReturnType<T>;

  return (...args: Parameters<T>): ReturnType<T> => {
    if (didCall) { return result; }
    didCall = true;
    result = fn(...args);
    return result;
  };
}
export function onceEvent<T>(event: vscode.Event<T>, filter?: (arg: T) => boolean): vscode.Event<T> {
  return (listener: (e: T) => unknown, thisArgs?: unknown, disposables?: vscode.Disposable[]): vscode.Disposable => {
    let didFire = false; // in case the event fires during the listener call
    const result = event(e => {
      if (didFire) { return; }
      else if (filter ? filter(e) : true) {
        didFire = true;
        result.dispose();
        return listener.call(thisArgs, e);
      }
    }, null, disposables);

    return result;
  };
}