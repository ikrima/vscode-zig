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

export interface ZigSettingsData {
  binary:                   string;
  buildRootDir:             string;
  buildCacheDir:            string;
  buildOutDir:              string;
  buildFile:                string;
  enableTaskProblemMatcher: boolean;
}
class ZigSettings extends ExtensionConfigBase<ZigSettingsData> {
  constructor(scope?: vsc.ConfigurationScope | null) {
    super(
      Const.extensionId,
      scope,
      (zig: ZigSettingsData): void => {
        const varCtx = new VariableResolver();
        zig.binary        = varCtx.resolveVars(zig.binary, { normalizePath: true });
        zig.buildRootDir  = varCtx.resolveVars(zig.buildRootDir, { normalizePath: true });
        zig.buildCacheDir = varCtx.resolveVars(zig.buildCacheDir, { relBasePath: zig.buildRootDir });
        zig.buildCacheDir = path.isAbsolute(zig.buildCacheDir) ? zig.buildCacheDir : path.join(zig.buildRootDir, zig.buildCacheDir);
        zig.buildOutDir   = varCtx.resolveVars(zig.buildOutDir, { relBasePath: zig.buildRootDir });
        zig.buildOutDir   = path.isAbsolute(zig.buildOutDir) ? zig.buildOutDir : path.join(zig.buildRootDir, zig.buildOutDir);
        zig.buildFile     = varCtx.resolveVars(zig.buildFile, { relBasePath: zig.buildRootDir });
      },
    );
  }
}
export interface ZlsSettingsData {
  binary:      string;
  debugBinary: string | null;
  enableDebug: boolean;
}
class ZlsSettings extends ExtensionConfigBase<ZlsSettingsData> {
  constructor(scope?: vsc.ConfigurationScope | null) {
    super(
      Const.langServerId,
      scope,
      (zls: ZlsSettingsData): void => {
        const varCtx = new VariableResolver();
        zls.binary      = varCtx.resolveVars(zls.binary, { normalizePath: true });
        zls.debugBinary = zls.debugBinary ? varCtx.resolveVars(zls.debugBinary, { normalizePath: true }) : null;
      },
    );
  }

  get zls(): ZlsSettingsData { return this._cfgData!; } // eslint-disable-line @typescript-eslint/no-non-null-assertion
}

export class ZigExtConfig  {
  protected _zig: ZigSettings;
  protected _zls: ZlsSettings;
  constructor(scope?: vsc.ConfigurationScope | null) {
    this._zig = new ZigSettings(scope);
    this._zls = new ZlsSettings(scope);
  }

  get zig(): ZigSettingsData { return this._zig.cfgData; } // eslint-disable-line @typescript-eslint/no-non-null-assertion
  get zls(): ZlsSettingsData { return this._zls.cfgData; } // eslint-disable-line @typescript-eslint/no-non-null-assertion

}