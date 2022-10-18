'use strict';
import * as vsc from 'vscode';
import { ScopedError } from './dbg';
import { deepCopy } from './objects';
import * as path from './path';
import * as plat from './plat';
import * as types from './types';

// Gets the config value `clangd.<key>`. Applies ${variable} substitutions.
export function getConfigSection<T>(
  section: string,
  scope?: vsc.ConfigurationScope | null,
  resolveVars?: ((rawConfig: T) => T) | null,
): T | undefined {
  const rawConfig = vsc.workspace.getConfiguration(undefined, scope).get<T>(section);
  if (!rawConfig) { return undefined; }
  const cfgData = deepCopy<T>(rawConfig);
  return resolveVars ? resolveVars(cfgData) : cfgData;
}

export interface ConfigSettings<T> {
  readonly cfgData: T;
  reloadCfg(): void;
}
export namespace ConfigSettings {
  export function create<T>(
    section: string,
    scope?: vsc.ConfigurationScope | null,
    resolveVars?: ((rawConfig: T) => T) | null,
  ): ConfigSettings<T> {
    return new ConfigSettingsData<T>(section, scope, resolveVars);
  }
}
class ConfigSettingsData<T> implements ConfigSettings<T> {
  protected _cfgData: T | undefined;
  constructor(
    protected section: string,
    protected scope?: vsc.ConfigurationScope | null,
    protected resolveVars?: ((rawConfig: T) => T) | null,
  ) { }

  get cfgData(): T {
    if (!this._cfgData) { this.reloadCfg(); }
    return this._cfgData!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
  }

  public reloadCfg(): void {
    this._cfgData = getConfigSection<T>(this.section, this.scope, this.resolveVars);
    if (!types.isDefined(this._cfgData)) { throw new ScopedError(`Could load config section ${this.section}`); }
  }
}


//========================================================================================================================
// #region Variable Resolver

// Subset of substitution variables that are most likely to be useful e.g. https://code.visualstudio.com/docs/editor/variables-reference
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
  private readonly envVars: plat.EnvVars;
  private readonly wksVars: WksVars;
  constructor(ctxVars: Partial<WksVars> = {}, envVars: plat.EnvVars = {}) {
    this.config = vsc.workspace.getConfiguration();
    this.envVars = Object.assign({}, plat.env, envVars);
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

    // Resolve `~` at the start of the path
    ret = ret.replace(/^~/g, (_match: string, _name: string) => plat.homedir());
    if (opt.relBasePath) { ret = path.resolve(opt.relBasePath, ret); }
    if (opt.normalizePath) { ret = path.normalize(ret); }
    return ret;
  }
}


// #endregion
//========================================================================================================================
