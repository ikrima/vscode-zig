'use strict';
import * as vscode from 'vscode';
import { path, types } from './utils/common';
import * as ext from './utils/ext';
import { Logger, LogLevel } from './utils/logger';
import { DisposableStore } from './utils/dispose';
import { Const } from './zigConst';
import { ZlsServices } from './zigLangClient';
import { ZigBuildTaskProvider } from './task/buildTaskProvider';
import { ZigTestTaskProvider } from './task/testTaskProvider';
import { ZigCodelensProvider } from "./zigCodeLensProvider";

export let zig_logger: Logger;       // eslint-disable-line @typescript-eslint/naming-convention
export let zig_cfg:    ZigExtConfig; // eslint-disable-line @typescript-eslint/naming-convention

export class ZigExtServices extends DisposableStore {
  constructor(public context: vscode.ExtensionContext) { super(); }

  public async activate(): Promise<void> {
    const extChannel = this.addDisposable(vscode.window.createOutputChannel(Const.extensionId));
    zig_cfg          = new ZigExtConfig();
    zig_logger       = Logger.channelLogger(extChannel, LogLevel.warn);

    return Promise.allSettled([
      this.addDisposable(new ZlsServices()).activate(),
      this.addDisposable(new ZigCodelensProvider()).activate(),
      this.addDisposable(new ZigBuildTaskProvider()).activate(),
      this.addDisposable(new ZigTestTaskProvider()).activate(),
    ]).then(results => results.forEach(p => {
      switch (p.status) {
        case 'fulfilled': break;
        case 'rejected': zig_logger.error('Failed to activate extension', p.reason); break;
        default: types.assertNever(p);
      }
    }));
  }
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
      Const.extensionId,
      scope,
      (zig: ZigConfigData): void => {
        const varCtx = new ext.VariableResolver();
        zig.binary          = varCtx.resolveVars(zig.binary, { normalizePath: true });
        zig.buildRootDir    = varCtx.resolveVars(zig.buildRootDir, { normalizePath: true });    // ext.defaultWksFolderPath() ?? ""          );
        zig.buildFile       = varCtx.resolveVars(zig.buildFile, { relBasePath: zig.buildRootDir });       // path.join(this.build_rootDir,"build.zig") );
        zig.zls.binary      = varCtx.resolveVars(zig.zls.binary, { normalizePath: true });
        zig.zls.debugBinary = zig.zls.debugBinary ? varCtx.resolveVars(zig.zls.debugBinary, { normalizePath: true }) : null;
      },
    );
  }

  get zig(): ZigConfigData { return this._cfgData; }
  get outDir(): string { return path.join(this.zig.buildRootDir, "zig-out", "bin"); }
  get cacheDir(): string { return path.join(this.zig.buildRootDir, "zig-cache"); }
}
