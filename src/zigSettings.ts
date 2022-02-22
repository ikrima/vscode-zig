'use strict';

import * as vscode from "vscode";
import * as path from 'path';
import * as os from 'os';
import * as process from 'process';

export type  VariableContext = { [key: string]: string | undefined };
export const isWindows       = process.platform === 'win32';
export const envDelimiter    = isWindows ? ";" : ":";
export function isString            (input: any):   input is string                  { return typeof (input) === "string"            ; }
export function isArray             (input: any):   input is any[]                   { return input instanceof Array                 ; }
export function isArrayOfString     (input: any):   input is string[]                { return isArray(input) && input.every(isString); }
export function findWorkspaceFolder (name: string): vscode.WorkspaceFolder|undefined { return vscode.workspace.workspaceFolders?.find(wf => name.toLowerCase() === wf.name.toLowerCase()); }
export function isZigFile           (uri: vscode.Uri | undefined): boolean           { return uri ? ".zig" === path.extname(uri.fsPath).toLowerCase() : false; }

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
    const varRegEx: () => RegExp = () => /\$\{((env|config|workspaceFolder|workspaceFolderBasename|file|fileWorkspaceFolder|relativeFile|relativeFileDirname|fileBasename|fileBasenameNoExtension|fileDirname|fileExtname|cwd|lineNumber|selectedText|execPath|pathSeparator)(\.|:))?(.*?)\}/g;
    let ret: string = input;
    const cycleCache: Set<string> = new Set();
    while (!cycleCache.has(ret)) {
        cycleCache.add(ret);
        ret = ret.replace(varRegEx(), (match: string, _1: string, varType: string, _3: string, name: string) => {
            let newValue: string | undefined;
            switch (varType) {
                case "env":                     { newValue = varCtx[name] ?? process.env[name]; break; }
                case "config":                  { newValue = config.get<string>(name); break; }
                case "workspaceFolder":         { newValue = name ? findWorkspaceFolder(name)?.uri.fsPath : varCtx.workspaceFolder;         break; }
                case "workspaceFolderBasename": { newValue = name ? findWorkspaceFolder(name)?.name       : varCtx.workspaceFolderBasename; break; }
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
                default:                        { vscode.window.showErrorMessage(`unknown variable to resolve: ${match}`); break; }
            }
            return newValue ?? match;
        });
    }

    // Resolve '~' at the start of the path
    ret = ret.replace(/^\~/g, (_match: string, _name: string) => os.homedir());
    return ret;
}


class BaseExtSettings {
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
        return this.config.get<string[]>(section, []).map(configVal => {
            return resolveVariables(configVal);
        });
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


export const enum BuildStep {
    buildFile,
    buildExe,
    buildLib,
    buildObj,
}

export class ZigExtSettings extends BaseExtSettings {
    public  static readonly languageId       = 'zig';
    private static readonly dfltBuildRootDir = path.normalize(vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? "");
    private static _cached?: ZigExtSettings;
    private _zigBinPath?               : string   ;
    private _zlsBinPath?               : string   ;
    private _zlsDebugLog?              : boolean  ;
    private _buildRootDir?             : string   ;
    private _buildBuildFile?           : string   ;
    private _buildBuildStep?           : BuildStep;
    private _buildExtraArgs?           : string[] ;
    private _taskBinDir?               : string   ;
    private _taskTestArgs?             : string[] ;
    private _taskDebugArgs?            : string[] ;
    private _taskEnableProblemMatcher? : boolean  ;
    private _miscBuildOnSave?          : boolean  ;
    private _miscRevealOnFormatError?  : boolean  ;

    constructor(resource?: vscode.Uri) { super('zig', resource); }
    public static getSettings(forceReload?: boolean): ZigExtSettings {
        if (!ZigExtSettings._cached || forceReload) { ZigExtSettings._cached = new ZigExtSettings(); }
        return ZigExtSettings._cached;
    }

    public get zigBinPath               (): string         { if (!this._zigBinPath               ) { this._zigBinPath               = super.getResolvedPath  ("binPath"                  , "zig.exe"                         ); } return this._zigBinPath;               }
    public get zlsBinPath               (): string         { if (!this._zlsBinPath               ) { this._zlsBinPath               = super.getResolvedPath  ("zls.binPath"              , "zls.exe"                         ); } return this._zlsBinPath;               }
    public get zlsDebugLog              (): boolean        { if (!this._zlsDebugLog              ) { this._zlsDebugLog              = super.getWithFallback  ("zls.debugLog"             , false                             ); } return this._zlsDebugLog;              }
    public get buildRootDir             (): string         { if (!this._buildRootDir             ) { this._buildRootDir             = super.getResolvedPath  ("build.rootDir"            , ZigExtSettings.dfltBuildRootDir   ); } return this._buildRootDir;             }
    public get buildBuildFile           (): string         { if (!this._buildBuildFile           ) { this._buildBuildFile           = super.getResolvedPath  ("build.buildFile"          , `${this.buildRootDir}/build.zig`  ); } return this._buildBuildFile;           }
    public get buildBuildStep           (): BuildStep      { if (!this._buildBuildStep           ) { this._buildBuildStep           = super.getWithFallback  ("build.buildStep"          , BuildStep.buildFile               ); } return this._buildBuildStep;           }
    public get buildExtraArgs           (): string[]       { if (!this._buildExtraArgs           ) { this._buildExtraArgs           = super.getResolvedArray ("build.extraArgs"                                              ); } return this._buildExtraArgs;           }
    public get taskBinDir               (): string         { if (!this._taskBinDir               ) { this._taskBinDir               = super.getResolvedPath  ("task.binDir"              , `${this.buildRootDir}/zig-out/bin`); } return this._taskBinDir;               }
    public get taskTestArgs             (): string[]       { if (!this._taskTestArgs             ) { this._taskTestArgs             = super.getResolvedArray ("task.testArgs"                                                ); } return this._taskTestArgs;             }
    public get taskDebugArgs            (): string[]       { if (!this._taskDebugArgs            ) { this._taskDebugArgs            = super.getResolvedArray ("task.debugArgs"                                               ); } return this._taskDebugArgs;            }
    public get taskEnableProblemMatcher (): boolean        { if (!this._taskEnableProblemMatcher ) { this._taskEnableProblemMatcher = super.getWithFallback  ("task.enableProblemMatcher", true                              ); } return this._taskEnableProblemMatcher; }
    public get miscBuildOnSave          (): boolean        { if (!this._miscBuildOnSave          ) { this._miscBuildOnSave          = super.getWithFallback  ("misc.buildOnSave"         , false                             ); } return this._miscBuildOnSave;          }
    public get miscRevealOnFormatError  (): boolean        { if (!this._miscRevealOnFormatError  ) { this._miscRevealOnFormatError  = super.getWithFallback  ("misc.revealOnFormatError" , true                              ); } return this._miscRevealOnFormatError;  }
};


// interface IZigSettings {
//     zigBinPath: string;
//     zls: {
//         binPath:  string;
//         debugLog: boolean;
//     };
//     build: {
//         rootDir:   string;
//         buildFile: string;
//         buildStep: BuildStep;
//         extraArgs: string[];
//     };
//     task: {
//         binDir:               string;
//         testArgs:             string[];
//         debugArgs:            string[];
//         enableProblemMatcher: boolean;
//     };
//     misc: {
//         buildOnSave:         boolean;
//         revealOnFormatError: boolean;
//     };
// }
// function getExtensionSettings(): IZigSettings {
//     const config           = ZigExtSettings.getSettings();

//     const dfltBuildRootDir = vscode.workspace.workspaceFolders ? path.normalize(vscode.workspace.workspaceFolders[0].uri.fsPath) : "";
//     const _buildRootDir    = path.normalize(config.getResolved("build.rootDir", dfltBuildRootDir));
//     let   _buildStep   = BuildStep.buildFile;
//     switch (config.getWithFallback<string>("build.buildStep", "build")) {
//         case "build":     _buildStep = BuildStep.buildFile; break;
//         case "build-exe": _buildStep = BuildStep.buildExe; break;
//         case "build-lib": _buildStep = BuildStep.buildLib; break;
//         case "build-obj": _buildStep = BuildStep.buildObj; break;
//     }
//     return {
//         zigBinPath: path.normalize(config.getResolved("binPath", "zig.exe")),
//         zls:   {
//             binPath:  path.normalize(config.getResolved("zls.binPath", "zls.exe")),
//             debugLog: config.getWithFallback<boolean>("zls.debugLog", false),
//         },
//         build: {
//             rootDir:   _buildRootDir,
//             buildFile: path.normalize(config.getResolved("build.buildFile", path.join(_buildRootDir, "build.zig"))),
//             buildStep:  _buildStep,
//             extraArgs: config.getResolvedArray("build.extraArgs"),
//         },
//         task: {
//             binDir:               path.normalize(config.getResolved("task.binDir", path.join(_buildRootDir, "zig-out/bin"))),
//             testArgs:             config.getResolvedArray("task.testArgs"),
//             debugArgs:            config.getResolvedArray("task.debugArgs"),
//             enableProblemMatcher: config.getWithFallback<boolean>("task.enableProblemMatcher", true),
//         },
//         misc: {
//             buildOnSave:         config.getWithFallback<boolean>("misc.buildOnSave", false),
//             revealOnFormatError: config.getWithFallback<boolean>("misc.revealOnFormatError", true),
//         },
//     };
// }
