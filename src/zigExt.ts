'use strict';
import * as vsc from 'vscode';
import { path } from './utils/common';
import { ConfigSettings } from './utils/config';
import { VariableResolver } from './utils/ext';
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
    const extChannel = this.addDisposable(vsc.window.createOutputChannel(Const.zig.extChanName));
    zig_cfg          = new ZigExtConfig();
    zig_logger       = Logger.channelLogger(extChannel, LogLevel.warn);

    this.addDisposable(new ZlsServices()).activate();
    this.addDisposable(new ZigCodelensProvider()).activate();
    this.addDisposable(new ZigBuildTaskProvider()).activate();
    this.addDisposable(new ZigTestTaskProvider()).activate();
  }
}

interface ZigSettings {
  binary:                   string;
  buildRootDir:             string;
  buildCacheDir:            string;
  buildOutDir:              string;
  buildFile:                string;
  enableTaskProblemMatcher: boolean;
}
interface ZlsSettings {
  binary:      string;
  debugBinary: string | null;
  enableDebug: boolean;
  trace: {
    server: string; // lc.Trace
    format: string; // lc.TraceFormat
  };
  enable_snippets:                              boolean;
  enable_unused_variable_warnings:              boolean;
  enable_import_embedfile_argument_completions: boolean;
  zig_lib_path:                                 string | null;
  zig_exe_path:                                 string | null;
  warn_style:                                   boolean;
  build_runner_path:                            string | null;
  build_runner_cache_path:                      string | null;
  enable_semantic_tokens:                       boolean;
  operator_completions:                         boolean;
  include_at_in_builtins:                       boolean;
  max_detail_length:                            number;
  skip_std_references:                          boolean;
  builtin_path:                                 string | null;
}
export class ZigExtConfig  {
  private varCtx: VariableResolver;
  private _zig: ConfigSettings<ZigSettings>;
  private _zls: ConfigSettings<ZlsSettings>;
  constructor(scope?: vsc.ConfigurationScope | null) {
    this.varCtx = new VariableResolver();
    this._zig = ConfigSettings.create<ZigSettings>(
      Const.zig.extensionId,
      scope,
      (zig: ZigSettings): ZigSettings => {
        zig.binary        = this.varCtx.resolveVars(zig.binary, { normalizePath: true });
        zig.buildRootDir  = this.varCtx.resolveVars(zig.buildRootDir, { normalizePath: true });
        zig.buildCacheDir = this.varCtx.resolveVars(zig.buildCacheDir, { relBasePath: zig.buildRootDir });
        zig.buildCacheDir = path.isAbsolute(zig.buildCacheDir) ? zig.buildCacheDir : path.join(zig.buildRootDir, zig.buildCacheDir);
        zig.buildOutDir   = this.varCtx.resolveVars(zig.buildOutDir, { relBasePath: zig.buildRootDir });
        zig.buildOutDir   = path.isAbsolute(zig.buildOutDir) ? zig.buildOutDir : path.join(zig.buildRootDir, zig.buildOutDir);
        zig.buildFile     = this.varCtx.resolveVars(zig.buildFile, { relBasePath: zig.buildRootDir });
        return zig;
      },
    );
    this._zls = ConfigSettings.create<ZlsSettings>(
      Const.zls.langServerId,
      scope,
      (zls: ZlsSettings): ZlsSettings => {
        zls.binary      = this.varCtx.resolveVars(zls.binary, { normalizePath: true });
        zls.debugBinary = zls.debugBinary ? this.varCtx.resolveVars(zls.debugBinary, { normalizePath: true }) : null;
        return zls;
      },
    );
  }

  get zig(): ZigSettings { return this._zig.cfgData; }
  get zls(): ZlsSettings { return this._zls.cfgData; }

}