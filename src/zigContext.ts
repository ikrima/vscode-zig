/* eslint-disable @typescript-eslint/naming-convention */
'use strict';
import * as vscode from "vscode";
import { log, ext } from './utils';
import { ExtConst } from './zigConst';
import { ZlsContext } from './zigLangClient';
import { ZigCodelensProvider } from './zigCodeLensProvider';
import { ZigTestTaskProvider } from './zigTaskProvider';
import { ZigBuildTaskProvider } from './zigBuildTaskProvider';

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
    readonly extContext:           vscode.ExtensionContext;
    readonly zigCfg:               ZigExtConfig;
    readonly logger:               log.Logger;
    private  extChannel:           vscode.OutputChannel;
    private  zlsContext:           ZlsContext;
    private  zigCodeLensProvider:  ZigCodelensProvider;
    private  zigBuildTaskProvider: ZigBuildTaskProvider;
    private  zigTestTaskProvider:  ZigTestTaskProvider;
    private  registrations:        vscode.Disposable[] = [];
    constructor(context: vscode.ExtensionContext) {
        this.extContext           = context;
        this.extChannel           = vscode.window.createOutputChannel(ExtConst.extensionId);
        this.logger               = log.makeChannelLogger(log.LogLevel.warn, this.extChannel);
        this.zigCfg               = new ZigExtConfig();
        this.zlsContext           = new ZlsContext();
        this.zigCodeLensProvider  = new ZigCodelensProvider();
        this.zigBuildTaskProvider = new ZigBuildTaskProvider();
        this.zigTestTaskProvider  = new ZigTestTaskProvider();
        this.registrations.push(
            vscode.languages.registerCodeLensProvider(ExtConst.documentSelector, this.zigCodeLensProvider),
            vscode.tasks.registerTaskProvider(ExtConst.buildTaskType, this.zigBuildTaskProvider),
            vscode.tasks.registerTaskProvider(ExtConst.testTaskType,  this.zigTestTaskProvider),
        );
    }
    async backgroundInit(): Promise<void> {
        this.zigBuildTaskProvider.initialize();
        return this.zlsContext.startClient();
    }
    async backgroundDeinit(): Promise<void> {
        this.registrations.forEach(d => void d.dispose());
        this.registrations = [];
        this.zigTestTaskProvider.dispose();
        this.zigBuildTaskProvider.dispose();
        this.zigCodeLensProvider.dispose();
        await this.zlsContext.asyncDispose().catch();
        this.extChannel.dispose();
    }
}

export interface ZlsConfigData {
    binary:                string;
    debugBinary:           string | null;
    enableDebug:           boolean;
}
export interface ZigConfigData {
    binary:                   string;
    buildRootDir:             string;
    buildFile:                string;
    enableTaskProblemMatcher: boolean;
    zls:                      ZlsConfigData;
}
class ZigExtConfig extends ext.ExtensionConfigBase<ZigConfigData> {
    constructor(scope?: vscode.ConfigurationScope | null) {
        super(
            ExtConst.extensionId,
            scope,
            (zig: ZigConfigData): void => {
                const varCtx = new ext.VariableResolver();
                zig.binary           = varCtx.resolveVars(zig.binary,       { normalizePath: true             });
                zig.buildRootDir     = varCtx.resolveVars(zig.buildRootDir, { normalizePath: true             });    // ext.defaultWksFolderPath() ?? ""          );
                zig.buildFile        = varCtx.resolveVars(zig.buildFile,    { relBasePath:   zig.buildRootDir });       // path.join(this.build_rootDir,"build.zig") );
                zig.zls.binary       = varCtx.resolveVars(zig.zls.binary,   { normalizePath: true             });
                zig.zls.debugBinary  = zig.zls.debugBinary ? varCtx.resolveVars(zig.zls.debugBinary, { normalizePath: true }) : null;
            },
        );
    }

    get zig(): ZigConfigData { return this._cfgData; }
}
