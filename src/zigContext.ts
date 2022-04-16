/* eslint-disable @typescript-eslint/naming-convention */
'use strict';
import type * as vscode from "vscode";
import { log, ext } from './utils';
import { ExtConst } from './zigConst';

// The extension deactivate method is asynchronous, so we handle the disposables ourselves instead of using extensonContext.subscriptions
export class ZigExt{
    static logger: log.Logger;
    static zigCfg: ZigExtConfig;
}

export interface ZlsConfigData {
    binary:      string;
    debugBinary: string | null;
    enableDebug: boolean;
}
export interface ZigConfigData {
    binary:                   string;
    buildRootDir:             string;
    buildFile:                string;
    enableTaskProblemMatcher: boolean;
    zls:                      ZlsConfigData;
}
export class ZigExtConfig extends ext.ExtensionConfigBase<ZigConfigData> {
    constructor(scope?: vscode.ConfigurationScope | null) {
        super(
            ExtConst.extensionId,
            scope,
            (zig: ZigConfigData): void => {
                const varCtx        = new ext.VariableResolver();
                zig.binary          = varCtx.resolveVars(zig.binary, { normalizePath: true });
                zig.buildRootDir    = varCtx.resolveVars(zig.buildRootDir, { normalizePath: true });    // ext.defaultWksFolderPath() ?? ""          );
                zig.buildFile       = varCtx.resolveVars(zig.buildFile, { relBasePath: zig.buildRootDir });       // path.join(this.build_rootDir,"build.zig") );
                zig.zls.binary      = varCtx.resolveVars(zig.zls.binary, { normalizePath: true });
                zig.zls.debugBinary = zig.zls.debugBinary ? varCtx.resolveVars(zig.zls.debugBinary, { normalizePath: true }) : null;
            },
        );
    }

    get zig(): ZigConfigData { return this._cfgData; }
}
