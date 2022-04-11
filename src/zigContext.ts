/* eslint-disable @typescript-eslint/naming-convention */
'use strict';
import * as vscode from "vscode";
import { ext } from './utils';
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
    readonly zigExtCfg:   ZigExtConfig;
    zlsContext:           ZlsContext;
    zigCodeLensProvider:  ZigCodelensProvider;
    zigTaskProvider:      ZigTaskProvider;
    registrations:        vscode.Disposable[] = [];
    constructor(context: vscode.ExtensionContext) {
        this.extContext          = context;
        this.zigChannel          = vscode.window.createOutputChannel(ZigConst.extensionId);
        this.zigExtCfg           = new ZigExtConfig();
        this.zlsContext          = new ZlsContext();
        this.zigCodeLensProvider = new ZigCodelensProvider();
        this.zigTaskProvider     = new ZigTaskProvider();
        this.registrations.push(
            vscode.languages.registerCodeLensProvider(ZigConst.documentSelector, this.zigCodeLensProvider),
            vscode.tasks.registerTaskProvider(ZigConst.taskScriptType, this.zigTaskProvider),
        );
    }
    async backgroundInit(): Promise<void> {
        return this.zlsContext.startClient();
    }
    async backgroundDeinit(): Promise<void> {
        this.registrations.forEach(d => void d.dispose());
        this.registrations = [];
        this.zigTaskProvider.dispose();
        this.zigCodeLensProvider.dispose();
        await this.zlsContext.asyncDispose().catch();
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
    //         ZigExtConfig.zigDocumentSelector,
    //         new ZigCodeActionProvider(context)
    //     ),
    //     vscode.languages.registerDocumentFormattingEditProvider(
    //         ZigExtConfig.zigDocumentSelector,
    //         new ZigFormatProvider(logChannel),
    //     ),
    //     vscode.languages.registerDocumentRangeFormattingEditProvider(
    //         ZigExtConfig.zigDocumentSelector,
    //         new ZigRangeFormatProvider(logChannel),
    //     ),
    //     vscode.commands.registerCommand('zig.build.workspace', () => {
    //         if (!vscode.window.activeTextEditor) { return; }
    //         zigBuild(vscode.window.activeTextEditor.document, buildDiagnostics, logChannel);
    //     }),
    // );
}

type BuildStep = 'buildFile' | 'buildExe' | 'buildLib' | 'buildObj';
export interface ZlsConfigData {
    binPath:               string;
    debugBinPath:          string | null;
    enableDebug:           boolean;
}
export interface BuildConfigData {
    rootDir:             string;
    buildFile:           string;
    buildStep:           BuildStep;
    extraArgs:           string[];
}
export interface TaskConfigData {
    binDir:               string | null;
    enableProblemMatcher: boolean;
}
export interface MiscConfigData {
    buildOnSave:          boolean;
    revealOnFormatError:  boolean;
}
export interface ZigConfigData {
    binPath: string;
    zls:     ZlsConfigData;
    build:   BuildConfigData;
    task:    TaskConfigData;
    misc:    MiscConfigData;
}
class ZigExtConfig extends ext.ExtensionConfigBase<ZigConfigData> {
    constructor(scope?: vscode.ConfigurationScope | null) {
        super(
            ZigConst.extensionId,
            scope,
            (cfgData: ZigConfigData): void => {
                cfgData.binPath          = ext.resolvePath(cfgData.binPath);
                cfgData.zls.binPath      = ext.resolvePath(cfgData.zls.binPath);
                cfgData.zls.debugBinPath = cfgData.zls.debugBinPath ? ext.resolvePath(cfgData.zls.debugBinPath) : null;
                cfgData.build.rootDir    = ext.resolvePath(cfgData.build.rootDir);    // ext.defaultWksFolderPath() ?? ""              );
                cfgData.build.buildFile  = ext.resolvePath(cfgData.build.buildFile);  // path.join(this.build_rootDir,"build.zig")     );
                cfgData.build.extraArgs  = ext.resolveArrayVars(cfgData.build.extraArgs);
                cfgData.task.binDir      = cfgData.task.binDir ? ext.resolvePath(cfgData.task.binDir) : null;
            },
        );
    }
}
