'use strict';
import * as os from 'os';
import * as vsc from 'vscode';
import { OnceEvent } from './async';
import * as cp from './cp';
import { ScopedError } from './logging';
import * as path from './path';
import * as strings from './strings';
import * as types from './types';

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
    this.envVars = Object.assign({}, cp.env, envVars);
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