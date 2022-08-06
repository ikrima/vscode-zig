'use strict';
import * as vsc from 'vscode';
import * as process_ from 'process';
import * as os from 'os';
import { path, types, cp, strings } from '../utils/common';
import { Logger, ScopedError } from './logging';
import { OnceEvent } from './async';


export const isWindows = process_.platform === "win32";

export function isExtensionActive   (extId: string): boolean                         { return vsc.extensions.getExtension(extId)?.isActive ?? false; }
export function findWorkspaceFolder (name: string):  vsc.WorkspaceFolder | undefined { return vsc.workspace.workspaceFolders?.find(wf => name.toLowerCase() === wf.name.toLowerCase()); }
export function defaultWksFolder    ():              vsc.WorkspaceFolder | undefined { return vsc.workspace.workspaceFolders?.[0]; }
export function defaultWksFolderPath():              string | undefined              { const folder = defaultWksFolder(); return folder ? path.normalize(folder.uri.fsPath) : undefined; }

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
  private readonly config: vsc.WorkspaceConfiguration;
  private readonly envVars: EnvVars;
  private readonly wksVars: WksVars;
  constructor(ctxVars: Partial<WksVars> = {}, envVars: EnvVars = {}) {
    this.config = vsc.workspace.getConfiguration();
    this.envVars = Object.assign({}, process_.env, envVars);
    const dfltWksFolder           = vsc.workspace.workspaceFolders?.[0];
    const dfltEditor              = vsc.window.activeTextEditor;
    const pathSeparator           = ctxVars.pathSeparator           ?? path.sep;
    const workspaceFolder         = ctxVars.workspaceFolder         ?? dfltWksFolder?.uri.fsPath;
    const workspaceFolderBasename = ctxVars.workspaceFolderBasename ?? dfltWksFolder?.name;
    const cwd                     = ctxVars.cwd                     ?? workspaceFolder;
    const file                    = ctxVars.file                    ?? dfltEditor?.document.uri.fsPath;
    const fileWorkspaceFolder     = ctxVars.fileWorkspaceFolder     ?? (file         ? vsc.workspace.getWorkspaceFolder(vsc.Uri.file(file))?.uri.fsPath : undefined);
    const relativeFile            = ctxVars.relativeFile            ?? (file         ? vsc.workspace.asRelativePath(vsc.Uri.file(file))                 : undefined);
    const relativeFileDirname     = ctxVars.relativeFileDirname     ?? (relativeFile ? path.dirname(relativeFile)                                       : undefined);
    const fileBasename            = ctxVars.fileBasename            ?? (file         ? path.basename(file)                                              : undefined);
    const fileExtname             = ctxVars.fileExtname             ?? (fileBasename ? path.extname(fileBasename)                                       : undefined);
    const fileBasenameNoExtension = ctxVars.fileBasenameNoExtension ?? (file         ? path.extname(file)                                               : undefined);
    const fileDirname             = ctxVars.fileDirname             ?? (file         ? path.dirname(file)                                               : undefined);
    const lineNumber              = ctxVars.lineNumber              ?? (dfltEditor   ? (dfltEditor?.selection.start.line + 1).toString()                : undefined);
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
            case "workspaceFolder"        : { newValue = this.wksVars.workspaceFolder        ; break; }
            case "workspaceFolderBasename": { newValue = this.wksVars.workspaceFolderBasename; break; }
            case "cwd"                    : { newValue = this.wksVars.cwd                    ; break; }
            case "pathSeparator"          : { newValue = this.wksVars.pathSeparator          ; break; }
            case "file"                   : { newValue = this.wksVars.file                   ; break; }
            case "fileWorkspaceFolder"    : { newValue = this.wksVars.fileWorkspaceFolder    ; break; }
            case "relativeFile"           : { newValue = this.wksVars.relativeFile           ; break; }
            case "relativeFileDirname"    : { newValue = this.wksVars.relativeFileDirname    ; break; }
            case "fileBasename"           : { newValue = this.wksVars.fileBasename           ; break; }
            case "fileBasenameNoExtension": { newValue = this.wksVars.fileBasenameNoExtension; break; }
            case "fileDirname"            : { newValue = this.wksVars.fileDirname            ; break; }
            case "fileExtname"            : { newValue = this.wksVars.fileExtname            ; break; }
            case "lineNumber"             : { newValue = this.wksVars.lineNumber             ; break; }
            case "selectedText"           : { newValue = this.wksVars.selectedText           ; break; }
            default: { void vsc.window.showErrorMessage(`unknown variable to resolve: [match: ${match}, scope: ${scope ?? "undefined"}, name: ${name}]`); break; }
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
  shellArgs?: string[];              // Any arguments
  cwd?: string;                      // Current working directory
  logger?: Logger;                   // Shows a message if an error occurs (in particular the command not being found), instead of rejecting. If this happens, the promise never resolves
  onStart?: () => void;              // Called after the process successfully starts
  onStdout?: (data: string) => void; // Called when data is sent to stdout
  onStderr?: (data: string) => void; // Called when data is sent to stderr
  onExit?: () => void;               // Called after the command (successfully or unsuccessfully) exits
  notFoundText?: string;             // Text to add when command is not found (maybe helping how to install)
}
export type ProcessRun = {
  procCmd: string;
  childProcess: cp.ChildProcess | undefined;
  isRunning: () => boolean;
  kill: () => void;
  completion: Promise<{ stdout: string; stderr: string }>;
};
export interface ProcRunException extends cp.ExecException {
  stdout?: string | undefined;
  stderr?: string | undefined;
}
// Spawns cancellable process
export function runProcess(cmd: string, options: ProcessRunOptions = {}): ProcessRun {
  let firstResponse = true;
  let wasKilledbyUs = false;
  let isRunning = true;
  let childProcess: cp.ChildProcess | undefined;
  const procCmd = strings.filterJoin(' ', [
    cmd,
    ...(options.shellArgs ?? [])
  ].map(normalizeShellArg));
  return {
    procCmd: procCmd,
    childProcess: childProcess,
    isRunning: () => isRunning,
    kill: () => {
      if (!(childProcess?.pid)) { return; }
      wasKilledbyUs = true;
      if (isWindows) { cp.spawn('taskkill', ['/pid', childProcess.pid.toString(), '/f', '/t']); }
      else { childProcess.kill('SIGINT'); }
    },
    completion: new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      childProcess = cp.exec(
        procCmd,
        { cwd: options.cwd }, // options.cwd ?? vsc.workspace.workspaceFolders?.[0].uri.fsPath,
        (err: cp.ExecException | null, stdout: string, stderr: string): void => {
          isRunning = false;
          if (options.onExit) { options.onExit(); }
          childProcess = undefined;
          if (wasKilledbyUs || !err) {
            resolve({ stdout, stderr });
          } else {
            if (options.logger) {
              const cmdName = cmd.split(' ', 1)[0];
              const cmdWasNotFound = isWindows
                ? err.message.includes(`'${cmdName}' is not recognized`)
                : err?.code === 127;
              options.logger.error(
                cmdWasNotFound
                  ? (options.notFoundText ?? `${cmdName} is not available in your path;`)
                  : err.message
              );
            }
            reject(Object.assign(
              (err ?? { name: "RunException", message: "Unknown" }) as ProcRunException,
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


export interface TaskInstance {
  on_task_start: Promise<void>;
  on_task_end: Promise<void>;
}
export namespace TaskInstance {
  type TaskEventArg = vsc.TaskStartEvent | vsc.TaskEndEvent | vsc.TaskProcessStartEvent | vsc.TaskProcessEndEvent;
  export async function launch(task: vsc.Task): Promise<TaskInstance> {
    return vsc.tasks.executeTask(task).then(
      (execution: vsc.TaskExecution): TaskInstance => {
        let on_start_once: OnceEvent | undefined = undefined;
        let on_end_once: OnceEvent | undefined = undefined;
        const taskFilter = (e: TaskEventArg): boolean => execution === e.execution;
        const eventFinalizer = () => {
          on_start_once?.cancel();
          on_end_once?.cancel();
        };
        const on_task_start = new Promise<void>((resolve, reject) => {
          on_start_once = OnceEvent.once(vsc.tasks.onDidStartTask, taskFilter, reject)(_ => resolve());
        }).finally(eventFinalizer);
        const on_task_end = new Promise<void>((resolve, reject) => {
          on_end_once = OnceEvent.once(vsc.tasks.onDidEndTask, taskFilter, reject)(_ => resolve());
        }).finally(eventFinalizer);

        return { on_task_start, on_task_end };
      },
      (reason?: unknown) => {
        const scopedError = cp.isExecException(reason)
          ? ScopedError.make(
            `${task.name} task run: finished with error(s)`,
            strings.filterJoin(os.EOL, [
              reason.cmd    ? `  cmd   : ${reason.cmd}`    : undefined,
              reason.code   ? `  code  : ${reason.code}`   : undefined,
              reason.signal ? `  signal: ${reason.signal}` : undefined,
              types.isObject(reason) && types.isString(reason['stderr'])
                ? `  task output: ${reason['stderr']}`
                : undefined,
            ]),
            undefined,
            undefined,
            reason.stack)
          : ScopedError.make(`${task.name} task run: finished with error(s)`, reason);
        return Promise.reject(scopedError);
      });
  }
}
