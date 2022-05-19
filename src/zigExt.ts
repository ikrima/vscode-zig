'use strict';
import * as vsc from 'vscode';
import { path } from './utils/common';
import { ExtensionConfigBase, VariableResolver } from './utils/ext';
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
  constructor(public context: vsc.ExtensionContext) { super(); }

  public activate(): void {
    const extChannel = this.addDisposable(vsc.window.createOutputChannel(Const.zigChanName));
    zig_cfg          = new ZigExtConfig();
    zig_logger       = Logger.channelLogger(extChannel, LogLevel.warn);

    this.addDisposable(new ZlsServices()).activate();
    this.addDisposable(new ZigCodelensProvider()).activate();
    this.addDisposable(new ZigBuildTaskProvider()).activate();
    this.addDisposable(new ZigTestTaskProvider()).activate();
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
export class ZigExtConfig extends ExtensionConfigBase<ZigConfigData> {
  constructor(scope?: vsc.ConfigurationScope | null) {
    super(
      Const.extensionId,
      scope,
      (zig: ZigConfigData): void => {
        const varCtx = new VariableResolver();
        zig.binary          = varCtx.resolveVars(zig.binary, { normalizePath: true });
        zig.buildRootDir    = varCtx.resolveVars(zig.buildRootDir, { normalizePath: true });        // defaultWksFolderPath() ?? ""          );
        zig.buildFile       = varCtx.resolveVars(zig.buildFile, { relBasePath: zig.buildRootDir }); // path.join(this.build_rootDir,"build.zig") );
        zig.zls.binary      = varCtx.resolveVars(zig.zls.binary, { normalizePath: true });
        zig.zls.debugBinary = zig.zls.debugBinary ? varCtx.resolveVars(zig.zls.debugBinary, { normalizePath: true }) : null;
      },
    );
  }

  get zig(): ZigConfigData { return this._cfgData!; } // eslint-disable-line @typescript-eslint/no-non-null-assertion
  get outDir(): string { return path.join(this.zig.buildRootDir, "zig-out", "bin"); }
  get cacheDir(): string { return path.join(this.zig.buildRootDir, "zig-cache"); }
}
