/* eslint-disable @typescript-eslint/naming-convention */
'use strict';
import * as vscode from "vscode";
import { ext, path } from './utils';
import { ZigConst } from './zigConst';
import { ZlsContext } from './zigLangClient';
import { ZigCodelensProvider } from './zigCodeLensProvider';
import { ZigTaskProvider } from './zigTaskProvider';

// The extension deactivate method is asynchronous, so we handle the disposables ourselves instead of using extensonContext.subscriptions
export let zigContext: ZigContext;
export async function initZigContext(context: vscode.ExtensionContext): Promise<void> {
    zigContext = new ZigContext(context);
    return zigContext.backgroundInit();
}
export async function deinitZigContext(): Promise<void> {
    if (!zigContext) { return Promise.resolve(); }
    await zigContext.backgroundDeinit();
}

class ZigContext {
    readonly extContext:  vscode.ExtensionContext;
    readonly zigChannel:  vscode.OutputChannel;
    zigCfg:               ZigConfig;
    zlsContext:           ZlsContext;
    zigCodeLensProvider:  ZigCodelensProvider;
    zigTaskProvider:      ZigTaskProvider;
    registrations:        vscode.Disposable[] = [];
    constructor(context: vscode.ExtensionContext) {
        this.extContext          = context;
        this.zigChannel          = vscode.window.createOutputChannel(ZigConst.extensionId);
        this.zigCfg              = new ZigConfig();
        this.zlsContext          = new ZlsContext();
        this.zigCodeLensProvider = new ZigCodelensProvider();
        this.zigTaskProvider     = new ZigTaskProvider();
        this.registrations.push(
            vscode.languages.registerCodeLensProvider(ZigConst.documentSelector, this.zigCodeLensProvider),
            vscode.tasks.registerTaskProvider(ZigConst.taskScriptType, this.zigTaskProvider),
        );
    }
    public reloadConfig(): void {
        this.zigCfg = new ZigConfig();
    }
    async backgroundInit(): Promise<void> {
        return this.zlsContext.startClient();
    }
    async backgroundDeinit(): Promise<void> {
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
    private _binPath?:                   string;
    private _zls_binPath?:               string;
    private _zls_debugBinPath?:          string | undefined;
    private _zls_enableDebug?:           boolean;
    private _build_rootDir?:             string;
    private _build_buildFile?:           string;
    private _build_buildStep?:           BuildStep;
    private _build_extraArgs?:           string[];
    private _task_binDir?:               string;
    private _task_enableProblemMatcher?: boolean;
    private _misc_buildOnSave?:          boolean;
    private _misc_revealOnFormatError?:  boolean;

    constructor(resource?: vscode.Uri) { super(ZigConst.extensionId, resource); }
    public get binPath                   (): string           { if (!this._binPath                   ) { this._binPath                   = super.resolvedPath  ("binPath"                  , "zig.exe"                                     ); } return this._binPath;                   }
    public get zls_binPath               (): string           { if (!this._zls_binPath               ) { this._zls_binPath               = super.resolvedPath  ("zls.binPath"              , "zls.exe"                                     ); } return this._zls_binPath;               }
    public get zls_debugBinPath          (): string|undefined { if (!this._zls_debugBinPath          ) { this._zls_debugBinPath          = super.resolvedPath  ("zls.debugBinPath"         , undefined                                     ); } return this._zls_debugBinPath;          }
    public get zls_enableDebug           (): boolean          { if (!this._zls_enableDebug           ) { this._zls_enableDebug           = super.fallbackGet   ("zls.enableDebug"          , false                                         ); } return this._zls_enableDebug;           }
    public get build_rootDir             (): string           { if (!this._build_rootDir             ) { this._build_rootDir             = super.resolvedPath  ("build.rootDir"            , ext.defaultWksFolderPath() ?? ""              ); } return this._build_rootDir;             }
    public get build_buildFile           (): string           { if (!this._build_buildFile           ) { this._build_buildFile           = super.resolvedPath  ("build.buildFile"          , path.join(this.build_rootDir,"build.zig")     ); } return this._build_buildFile;           }
    public get build_buildStep           (): BuildStep        { if (!this._build_buildStep           ) { this._build_buildStep           = super.fallbackGet   ("build.buildStep"          , BuildStep.buildFile                           ); } return this._build_buildStep;           }
    public get build_extraArgs           (): string[]         { if (!this._build_extraArgs           ) { this._build_extraArgs           = super.resolvedArray ("build.extraArgs"                                                          ); } return this._build_extraArgs;           }
    public get task_binDir               (): string           { if (!this._task_binDir               ) { this._task_binDir               = super.resolvedPath  ("task.binDir"              , path.join(this.build_rootDir,"zig-out","bin") ); } return this._task_binDir;               }
    public get task_enableProblemMatcher (): boolean          { if (!this._task_enableProblemMatcher ) { this._task_enableProblemMatcher = super.fallbackGet   ("task.enableProblemMatcher", true                                          ); } return this._task_enableProblemMatcher; }
    public get misc_buildOnSave          (): boolean          { if (!this._misc_buildOnSave          ) { this._misc_buildOnSave          = super.fallbackGet   ("misc.buildOnSave"         , false                                         ); } return this._misc_buildOnSave;          }
    public get misc_revealOnFormatError  (): boolean          { if (!this._misc_revealOnFormatError  ) { this._misc_revealOnFormatError  = super.fallbackGet   ("misc.revealOnFormatError" , true                                          ); } return this._misc_revealOnFormatError;  }
};