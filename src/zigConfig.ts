'use strict';
import * as vscode from "vscode";
import * as path from 'path';
import {ExtensionConfigBase} from './utils';

export const enum BuildStep {
    buildFile,
    buildExe,
    buildLib,
    buildObj,
}

export class ZigConfig extends ExtensionConfigBase {
    public  static readonly languageId          = 'zig';
    public  static readonly extensionId         = 'zig';
    public  static readonly zigDocumentSelector = [{ language: ZigConfig.languageId, scheme: 'file' }];
    private static readonly dfltBuildRootDir    = path.normalize(vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? "");
    private static _cached?: ZigConfig          = undefined;

    private _zigBinPath?               : string   ;
    private _zlsBinPath?               : string   ;
    private _zlsDebugBinPath?          : string   ;
    private _zlsEnableDebugMode?       : boolean  ;
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

    public static get(forceReload?: boolean): ZigConfig {
        if (!ZigConfig._cached || forceReload) { ZigConfig._cached = new ZigConfig(); }
        return ZigConfig._cached;
    }
    constructor(resource?: vscode.Uri) { super(ZigConfig.extensionId, resource); }
    public get zigBinPath               (): string             { if (!this._zigBinPath               ) { this._zigBinPath               = super.getResolvedPath  ("binPath"                  , "zig.exe"                         ); } return this._zigBinPath;               }
    public get zlsBinPath               (): string             { if (!this._zlsBinPath               ) { this._zlsBinPath               = super.getResolvedPath  ("zls.binPath"              , "zls.exe"                         ); } return this._zlsBinPath;               }
    public get zlsDebugBinPath          (): string | undefined { if (!this._zlsDebugBinPath          ) { this._zlsDebugBinPath          = super.getResolvedPath  ("zls.debugBinPath"         , undefined                         ); } return this._zlsDebugBinPath;          }
    public get zlsEnableDebugMode       (): boolean            { if (!this._zlsEnableDebugMode       ) { this._zlsEnableDebugMode       = super.getWithFallback  ("zls.enableDebugMode"      , false                             ); } return this._zlsEnableDebugMode;       }
    public get buildRootDir             (): string             { if (!this._buildRootDir             ) { this._buildRootDir             = super.getResolvedPath  ("build.rootDir"            , ZigConfig.dfltBuildRootDir        ); } return this._buildRootDir;             }
    public get buildBuildFile           (): string             { if (!this._buildBuildFile           ) { this._buildBuildFile           = super.getResolvedPath  ("build.buildFile"          , `${this.buildRootDir}/build.zig`  ); } return this._buildBuildFile;           }
    public get buildBuildStep           (): BuildStep          { if (!this._buildBuildStep           ) { this._buildBuildStep           = super.getWithFallback  ("build.buildStep"          , BuildStep.buildFile               ); } return this._buildBuildStep;           }
    public get buildExtraArgs           (): string[]           { if (!this._buildExtraArgs           ) { this._buildExtraArgs           = super.getResolvedArray ("build.extraArgs"                                              ); } return this._buildExtraArgs;           }
    public get taskBinDir               (): string             { if (!this._taskBinDir               ) { this._taskBinDir               = super.getResolvedPath  ("task.binDir"              , `${this.buildRootDir}/zig-out/bin`); } return this._taskBinDir;               }
    public get taskTestArgs             (): string[]           { if (!this._taskTestArgs             ) { this._taskTestArgs             = super.getResolvedArray ("task.testArgs"                                                ); } return this._taskTestArgs;             }
    public get taskDebugArgs            (): string[]           { if (!this._taskDebugArgs            ) { this._taskDebugArgs            = super.getResolvedArray ("task.debugArgs"                                               ); } return this._taskDebugArgs;            }
    public get taskEnableProblemMatcher (): boolean            { if (!this._taskEnableProblemMatcher ) { this._taskEnableProblemMatcher = super.getWithFallback  ("task.enableProblemMatcher", true                              ); } return this._taskEnableProblemMatcher; }
    public get miscBuildOnSave          (): boolean            { if (!this._miscBuildOnSave          ) { this._miscBuildOnSave          = super.getWithFallback  ("misc.buildOnSave"         , false                             ); } return this._miscBuildOnSave;          }
    public get miscRevealOnFormatError  (): boolean            { if (!this._miscRevealOnFormatError  ) { this._miscRevealOnFormatError  = super.getWithFallback  ("misc.revealOnFormatError" , true                              ); } return this._miscRevealOnFormatError;  }
};