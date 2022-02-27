'use strict';
import * as vscode from "vscode";
import * as path from 'path';
import * as os from 'os';
import * as process from 'process';
import * as cp from 'child_process';

//#region Common helper functions
export const isWindows    = process.platform === 'win32';
export const envDelimiter = isWindows ? ";" : ":";
export function isString            (a: any               ): a is string                        { return typeof (a) === "string"; }
export function isArray             (a: any               ): a is any[]                         { return a instanceof Array; }
export function isArrayOfString     (a: any               ): a is string[]                      { return isArray(a) && a.every(isString); }
export function isBlank             (a: any               ): boolean                            { return !(isString(a) && /\S/g.test(a)); }
export function max                 (a: number, b: number ): number                             { return a < b ? b : a; }
export function min                 (a: number, b: number ): number                             { return a < b ? a : b; }
export function findWorkspaceFolder (name: string         ): vscode.WorkspaceFolder | undefined { return vscode.workspace.workspaceFolders?.find(wf => name.toLowerCase() === wf.name.toLowerCase()); }
export function isExtensionActive   (extensionId: string  ): boolean                            { return vscode.extensions.getExtension(extensionId)?.isActive ?? false; }

export async function fileExists(filePath: string): Promise<boolean> { return await vscode.workspace.fs.stat(vscode.Uri.file(filePath)).then( stats => stats.type === vscode.FileType.File,      _ => false); }
export async function dirExists (dirPath:  string): Promise<boolean> { return await vscode.workspace.fs.stat(vscode.Uri.file(dirPath )).then( stats => stats.type === vscode.FileType.Directory, _ => false); }

export function normalizeShellArg(arg: string): string {
    arg = arg.trimLeft().trimRight();
    // Check if the arg is enclosed in backtick,
    // or includes unescaped double-quotes (or single-quotes on windows),
    // or includes unescaped single-quotes on mac and linux.
    if (/^`.*`$/g.test(arg) || /.*[^\\]".*/g.test(arg) ||
        (process.platform.includes("win") && /.*[^\\]'.*/g.test(arg)) ||
        (!process.platform.includes("win") && /.*[^\\]'.*/g.test(arg))) {
        return arg;
    }
    // The special character double-quote is already escaped in the arg.
    const unescapedSpaces: string | undefined = arg.split('').find((char, index) => index > 0 && char === " " && arg[index - 1] !== "\\");
    if (!unescapedSpaces && !process.platform.includes("win")) {
        return arg;
    } else if (arg.includes(" ")) {
        arg = arg.replace(/\\\s/g, " ");
        return "\"" + arg + "\"";
    } else {
        return arg;
    }
}
//#endregion

//#region Extension Helpers

export function warnNoActiveEditor()     { vscode.window.showWarningMessage("No active editor. Probably logic error in extension\n\n"); }
export function warnNoWorkspaceFolders() { vscode.window.showWarningMessage("No workspace folders. Probably logic error in extension\n\n"); }

export type VariableContext = { [key: string]: string | undefined };
export function resolveVariables(input: string, baseContext?: VariableContext): string {
    if (!input) { return ""; }
    const config                    = vscode.workspace.getConfiguration();
    const workspaceFolders          = vscode.workspace.workspaceFolders;
    const activeEditor              = vscode.window.activeTextEditor;

    const varCtx: VariableContext = {};
    if (baseContext) { Object.assign(varCtx, baseContext); }
    varCtx.workspaceFolder          = varCtx.workspaceFolder          ?? workspaceFolders?.[0].uri.fsPath;
    varCtx.workspaceFolderBasename  = varCtx.workspaceFolderBasename  ?? workspaceFolders?.[0].name;
    varCtx.file                     = varCtx.file                     ?? activeEditor?.document.uri.fsPath;
    varCtx.fileWorkspaceFolder      = varCtx.fileWorkspaceFolder      ?? (varCtx.file          ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(varCtx.file))?.uri.fsPath : undefined);
    varCtx.relativeFile             = varCtx.relativeFile             ?? (varCtx.file          ? vscode.workspace.asRelativePath(vscode.Uri.file(varCtx.file))                 : undefined);
    varCtx.relativeFileDirname      = varCtx.relativeFileDirname      ?? (varCtx.relativeFile  ? path.dirname  (varCtx.relativeFile )     : undefined);
    varCtx.fileBasename             = varCtx.fileBasename             ?? (varCtx.file          ? path.basename (varCtx.file         )     : undefined);
    varCtx.fileExtname              = varCtx.fileExtname              ?? (varCtx.fileBasename  ? path.extname  (varCtx.fileBasename )     : undefined);
    varCtx.fileBasenameNoExtension  = varCtx.fileBasenameNoExtension  ?? (varCtx.file          ? path.parse    (varCtx.file         ).ext : undefined);
    varCtx.fileDirname              = varCtx.fileDirname              ?? (varCtx.file          ? path.dirname  (varCtx.file         )     : undefined);
    varCtx.cwd                      = varCtx.cwd                      ?? varCtx.fileDirname;
    varCtx.lineNumber               = varCtx.lineNumber               ?? (activeEditor ? (activeEditor?.selection.start.line + 1).toString() : undefined);
    varCtx.selectedText             = varCtx.selectedText             ?? activeEditor?.document.getText(activeEditor.selection);
    varCtx.execPath                 = varCtx.execPath                 ?? process.execPath;
    varCtx.pathSeparator            = varCtx.pathSeparator            ?? path.sep;


    // // Replace environment and configuration variables.
    // let regexp: () => RegExp = () => /\$\{((env|config|workspaceFolder|file|fileDirname|fileBasenameNoExtension|execPath|pathSeparator)(\.|:))?(.*?)\}/g;
    const varRegEx = /\$\{((env|config|workspaceFolder|workspaceFolderBasename|file|fileWorkspaceFolder|relativeFile|relativeFileDirname|fileBasename|fileBasenameNoExtension|fileDirname|fileExtname|cwd|lineNumber|selectedText|execPath|pathSeparator)(\.|:))?(.*?)\}/g;
    let ret: string = input;
    const cycleCache: Set<string> = new Set();
    while (!cycleCache.has(ret)) {
        cycleCache.add(ret);
        ret = ret.replace(varRegEx, (match: string, _1: string, varType: string, _3: string, name: string) => {
            let newValue: string | undefined;
            switch (varType) {
                case "env":                     { newValue = varCtx[name] ?? process.env[name];     break; }
                case "config":                  { newValue = config.get<string>(name);              break; }
                case "workspaceFolder":         { newValue = findWorkspaceFolder(name)?.uri.fsPath; break; }
                case "workspaceFolderBasename": { newValue = findWorkspaceFolder(name)?.name;       break; }
                default:                        {
                    switch (name) {
                            case "workspaceFolder":         { newValue = varCtx.workspaceFolder;         break; }
                            case "workspaceFolderBasename": { newValue = varCtx.workspaceFolderBasename; break; }
                            case "file":                    { newValue = varCtx[name]                   ; break; }
                            case "fileWorkspaceFolder":     { newValue = varCtx[name]                   ; break; }
                            case "relativeFile":            { newValue = varCtx[name]                   ; break; }
                            case "relativeFileDirname":     { newValue = varCtx[name]                   ; break; }
                            case "fileBasename":            { newValue = varCtx[name]                   ; break; }
                            case "fileBasenameNoExtension": { newValue = varCtx[name]                   ; break; }
                            case "fileDirname":             { newValue = varCtx[name]                   ; break; }
                            case "fileExtname":             { newValue = varCtx[name]                   ; break; }
                            case "cwd":                     { newValue = varCtx[name]                   ; break; }
                            case "lineNumber":              { newValue = varCtx[name]                   ; break; }
                            case "selectedText":            { newValue = varCtx[name]                   ; break; }
                            case "execPath":                { newValue = varCtx[name]                   ; break; }
                            case "pathSeparator":           { newValue = varCtx[name]                   ; break; }
                            default:                        { vscode.window.showErrorMessage(`unknown variable to resolve: [match: ${match},_1: ${_1},varType: ${varType},_3: ${_3},name: ${name}]`); break; }
                    }
                }
            }
            return newValue ?? match;
        });
    }

    // Resolve '~' at the start of the path
    ret = ret.replace(/^\~/g, (_match: string, _name: string) => os.homedir());
    return ret;
}

export class ExtensionConfigBase {
    private readonly config: vscode.WorkspaceConfiguration;
    constructor(section: string, public resource?: vscode.Uri) {
        this.config = vscode.workspace.getConfiguration(section, resource ? resource : null);
    }

    public getWithFallback<T>(section: string, defaultValue: T): T {
        return this.config.get<T>(section, defaultValue);
    }
    public getResolved<T>(section: string, defaultVal: T): string | T {
        let configVal = this.config.get<string>(section);
        return configVal ? resolveVariables(configVal) : defaultVal;
    }
    public getResolvedArray(section: string): string[] {
        return this.config.get<string[]>(section, []).map(configVal => resolveVariables(configVal));
    }
    public getResolvedPath(section: string, defaultVal: string): string {
        return path.normalize(this.getResolved(section, defaultVal));
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

//#endregion


// A promise for running process and also a wrapper to access ChildProcess-like methods
export interface RunningCmd extends Promise<{ stdout: string; stderr: string }> {
  kill:      () => void;  // End the process
  isRunning: boolean;     // Is the process running
}

export interface RunningCmdOptions {
  shellArgs?:          string[];               // Any arguments
  cwd?:                string;                 // Current working directory
  showMessageOnError?: boolean;                // Shows a message if an error occurs (in particular the command not being found), instead of rejecting. If this happens, the promise never resolves
  onStart?:            () => void;             // Called after the process successfully starts
  onStdout?:           (data: string) => void; // Called when data is sent to stdout
  onStderr?:           (data: string) => void; // Called when data is sent to stderr
  onExit?:             () => void;             // Called after the command (successfully or unsuccessfully) exits
  notFoundText?:       string;                 // Text to add when command is not found (maybe helping how to install)
}

// Spawns cancellable process
export function runCmd(cmd: string, options: RunningCmdOptions = {}): RunningCmd {
  let firstResponse = true;
  let wasKilledbyUs = false;
  let childProcess: cp.ChildProcess | undefined = undefined;
  const runningCmd: any = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const shellArgs = (options.shellArgs ?? []).map(arg => normalizeShellArg(arg));
    childProcess = cp.exec(
      [cmd].concat(...shellArgs).join(' '),
      <cp.ExecOptions>{
        cwd: options.cwd, // options.cwd ?? vscode.workspace.workspaceFolders?.[0].uri.fsPath,
      },
      (err: cp.ExecException | null, stdout: string, stderr: string): void => {
        runningCmd.isRunning = false;
        if (options.onExit) { options.onExit(); }
        childProcess = undefined;
        if (wasKilledbyUs || !err) {
          resolve({ stdout, stderr });
        } else {
          if (options.showMessageOnError) {
            const cmdName = cmd.split(' ', 1)[0];
            const cmdWasNotFound = isWindows
              ? err.message.includes(`'${cmdName}' is not recognized`)
              : err?.code === 127;
            vscode.window.showErrorMessage(
              cmdWasNotFound
                ? `${cmdName} is not available in your path. ${options.notFoundText ?? ""}`
                : err.message
            );
          }
          reject({ err, stdout, stderr });
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
  });
  runningCmd.kill = (): void => {
    if (childProcess) {
      wasKilledbyUs = true;
      if (isWindows) {
        cp.spawn('taskkill', ['/pid', childProcess.pid.toString(), '/f', '/t']);
      }
      else {
        childProcess.kill('SIGINT');
      }
    }
  };
  runningCmd.isRunning = true;
  return runningCmd as RunningCmd;
}
