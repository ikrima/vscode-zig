'use strict';
import * as vscode from "vscode";
import * as path from 'path';
import { ext } from './utils';

import { ZlsContext } from './zigLangClient';
import { ZigCodelensProvider } from './zigCodeLensProvider';
import { ZigTaskProvider } from './zigTaskProvider';

// The extension deactivate method is asynchronous, so we handle the disposables ourselves instead of using extensonContext.subscriptions


export class ZigContext {
    private static _inst: ZigContext | undefined = undefined;
    public static readonly languageId          = 'zig';
    public static readonly extensionId         = 'zig';
    public static readonly zigDocumentSelector = [{ language: ZigContext.languageId, scheme: 'file' }];

    public readonly extContext:  vscode.ExtensionContext;
    public readonly zigChannel:  vscode.OutputChannel;
    private zigConfig:           ZigConfig;
    private zlsContext:          ZlsContext;
    private zigCodeLensProvider: ZigCodelensProvider;
    private zigTaskProvider:     ZigTaskProvider;
    private registrations:       vscode.Disposable[] = [];
    private constructor(context: vscode.ExtensionContext) {
        this.extContext          = context;
        this.zigConfig           = new ZigConfig();
        this.zigChannel          = vscode.window.createOutputChannel(ZigContext.extensionId);
        this.zlsContext          = new ZlsContext();
        this.zigCodeLensProvider = new ZigCodelensProvider();
        this.zigTaskProvider     = new ZigTaskProvider();
        this.registrations.push(
            vscode.languages.registerCodeLensProvider(ZigContext.zigDocumentSelector, this.zigCodeLensProvider),
            vscode.tasks.registerTaskProvider(ZigTaskProvider.ScriptType, this.zigTaskProvider),
        );
    }

    public static get inst(): ZigContext { return ZigContext._inst!; }

    public static async activate(context: vscode.ExtensionContext): Promise<void> {
        ZigContext._inst = new ZigContext(context);
        return ZigContext._inst.backgroundInit();
    }
    public static async deactivate(): Promise<void> {
        if (!ZigContext._inst) { return Promise.resolve(); }
        const zctx = ZigContext._inst;
        ZigContext._inst = undefined;
        await zctx.backgroundDeinit();
    }

    public getConfig(forceReload?: boolean): ZigConfig {
        if (forceReload) { this.zigConfig = new ZigConfig(); }
        return this.zigConfig;
    }
    private async backgroundInit(): Promise<void> {
        return this.zlsContext.startClient();
    }
    private async backgroundDeinit(): Promise<void> {
        this.registrations.forEach(d => d.dispose());
        this.registrations = [];
        this.zigTaskProvider.dispose();
        this.zigCodeLensProvider.dispose();
        await this.zlsContext.asyncDispose().catch(() => { });
        this.zigChannel.dispose();
    }


    // let zigFormatStatusBar: vscode.StatusBarItem;
    // zigFormatStatusBar = vscode.window.createStatusBarItem("zig.statusBar", vscode.StatusBarAlignment.Left);
    // zigFormatStatusBar.name = "zig build";
    // zigFormatStatusBar.text = "$(wrench) zig build workspace";
    // zigFormatStatusBar.tooltip = "zig build workspace";
    // zigFormatStatusBar.command = "zig.build.workspace";
    // zigFormatStatusBar.show();
    // const buildDiagnostics = vscode.languages.createDiagnosticCollection('zigBld');
    // context.subscriptions.push(
    //     vscode.languages.registerCodeActionsProvider(
    //         ZigConfig.zigDocumentSelector,
    //         new ZigCodeActionProvider(context)
    //     ),
    //     vscode.languages.registerDocumentFormattingEditProvider(
    //         ZigConfig.zigDocumentSelector,
    //         new ZigFormatProvider(logChannel),
    //     ),
    //     vscode.languages.registerDocumentRangeFormattingEditProvider(
    //         ZigConfig.zigDocumentSelector,
    //         new ZigRangeFormatProvider(logChannel),
    //     ),
    //     vscode.commands.registerCommand('zig.build.workspace', () => {
    //         if (!vscode.window.activeTextEditor) { return; }
    //         zigBuild(vscode.window.activeTextEditor.document, buildDiagnostics, logChannel);
    //     }),
    // );
};

export const enum BuildStep {
    buildFile,
    buildExe,
    buildLib,
    buildObj,
}

class ZigConfig extends ext.ExtensionConfigBase {
    private static readonly dfltBuildRootDir = path.normalize(vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? "");

    private _zigBinPath?:               string;
    private _zlsBinPath?:               string;
    private _zlsDebugBinPath?:          string | undefined;
    private _zlsEnableDebugMode?:       boolean;
    private _buildRootDir?:             string;
    private _buildBuildFile?:           string;
    private _buildBuildStep?:           BuildStep;
    private _buildExtraArgs?:           string[];
    private _taskBinDir?:               string;
    private _taskEnableProblemMatcher?: boolean;
    private _miscBuildOnSave?:          boolean;
    private _miscRevealOnFormatError?:  boolean;

    constructor(resource?: vscode.Uri) { super(ZigContext.extensionId, resource); }
    public get zigBinPath               (): string             { if (!this._zigBinPath               ) { this._zigBinPath               = super.getResolvedPath  ("binPath"                  , "zig.exe"                         ); } return this._zigBinPath;               }
    public get zlsBinPath               (): string             { if (!this._zlsBinPath               ) { this._zlsBinPath               = super.getResolvedPath  ("zls.binPath"              , "zls.exe"                         ); } return this._zlsBinPath;               }
    public get zlsDebugBinPath          (): string | undefined { if (!this._zlsDebugBinPath          ) { this._zlsDebugBinPath          = super.getResolvedPath  ("zls.debugBinPath"         , undefined                         ); } return this._zlsDebugBinPath;          }
    public get zlsEnableDebugMode       (): boolean            { if (!this._zlsEnableDebugMode       ) { this._zlsEnableDebugMode       = super.getWithFallback  ("zls.enableDebugMode"      , false                             ); } return this._zlsEnableDebugMode;       }
    public get buildRootDir             (): string             { if (!this._buildRootDir             ) { this._buildRootDir             = super.getResolvedPath  ("build.rootDir"            , ZigConfig.dfltBuildRootDir        ); } return this._buildRootDir;             }
    public get buildBuildFile           (): string             { if (!this._buildBuildFile           ) { this._buildBuildFile           = super.getResolvedPath  ("build.buildFile"          , `${this.buildRootDir}/build.zig`  ); } return this._buildBuildFile;           }
    public get buildBuildStep           (): BuildStep          { if (!this._buildBuildStep           ) { this._buildBuildStep           = super.getWithFallback  ("build.buildStep"          , BuildStep.buildFile               ); } return this._buildBuildStep;           }
    public get buildExtraArgs           (): string[]           { if (!this._buildExtraArgs           ) { this._buildExtraArgs           = super.getResolvedArray ("build.extraArgs"                                              ); } return this._buildExtraArgs;           }
    public get taskBinDir               (): string             { if (!this._taskBinDir               ) { this._taskBinDir               = super.getResolvedPath  ("task.binDir"              , `${this.buildRootDir}/zig-out/bin`); } return this._taskBinDir;               }
    public get taskEnableProblemMatcher (): boolean            { if (!this._taskEnableProblemMatcher ) { this._taskEnableProblemMatcher = super.getWithFallback  ("task.enableProblemMatcher", true                              ); } return this._taskEnableProblemMatcher; }
    public get miscBuildOnSave          (): boolean            { if (!this._miscBuildOnSave          ) { this._miscBuildOnSave          = super.getWithFallback  ("misc.buildOnSave"         , false                             ); } return this._miscBuildOnSave;          }
    public get miscRevealOnFormatError  (): boolean            { if (!this._miscRevealOnFormatError  ) { this._miscRevealOnFormatError  = super.getWithFallback  ("misc.revealOnFormatError" , true                              ); } return this._miscRevealOnFormatError;  }
};