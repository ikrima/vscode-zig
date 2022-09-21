'use strict';
import * as vsc from 'vscode';
import type * as lc from 'vscode-languageclient/node';
import { ZIG, ZLS } from './constants';
import { ConfigSettings } from './utils/config';
import { DisposableBase } from './utils/dispose';
import { Logger, LogLevel } from './utils/logging';
import * as path from './utils/path';
import { VariableResolver } from './utils/vsc';
import ZigBuildTaskProvider from './zig/buildTaskProvider';
import ZigTestTaskProvider from './zig/testTaskProvider';
import ZigCodelensProvider from './zig/codeLensProvider';
import ZlsServices from './zls/zlsClient';

export let extCfg: ZigExtConfig;

export class ZigExtServices extends DisposableBase {
  constructor(public context: vsc.ExtensionContext) { super(); }

  public activate(): void {
    extCfg = new ZigExtConfig(this._register(vsc.window.createOutputChannel(ZIG.extChanName)));
    this._register(new ZlsServices()).activate();
    this._register(new ZigCodelensProvider());
    this._register(new ZigBuildTaskProvider());
    this._register(new ZigTestTaskProvider());
  }
}

interface ZigSettings {
  binary:                   string;
  buildRootDir:             string;
  buildCacheDir:            string;
  buildOutDir:              string;
  buildFile:                string;
  enableTaskProblemMatcher: boolean;
  enableCodeLens:           boolean;
}
interface ZlsSettings {
  binary:      string;
  debugBinary: string | null;
  enableDebug: boolean;
  trace: {
    server: {
      verbosity: lc.TraceValues;       // lc.TraceValues;
      format:    'text' | 'json'; // lc.TraceFormat
    };
  };
  enable_snippets:                              boolean;
  enable_ast_check_diagnostics:                 boolean;
  enable_import_embedfile_argument_completions: boolean;
  zig_lib_path:                                 string | null;
  zig_exe_path:                                 string | null;
  warn_style:                                   boolean;
  build_runner_path:                            string | null;
  global_cache_path:                            string | null;
  enable_semantic_tokens:                       boolean;
  enable_inlay_hints:                           boolean;
  inlay_hints_show_builtin:                     boolean;
  inlay_hints_exclude_single_argument:          boolean;
  operator_completions:                         boolean;
  include_at_in_builtins:                       boolean;
  max_detail_length:                            number;
  skip_std_references:                          boolean;
  builtin_path:                                 string | null;
}
class ZigExtConfig  {
  private _mainLog: Logger;
  private varCtx: VariableResolver;
  private _zig: ConfigSettings<ZigSettings>;
  private _zls: ConfigSettings<ZlsSettings>;

  constructor(chan: vsc.OutputChannel, scope?: vsc.ConfigurationScope | null) {
    this._mainLog = Logger.channelLogger(chan, LogLevel.warn);
    this.varCtx = new VariableResolver();
    this._zig = ConfigSettings.create<ZigSettings>(
      ZIG.extensionId,
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
      ZLS.langServerId,
      scope,
      (zls: ZlsSettings): ZlsSettings => {
        zls.binary      = this.varCtx.resolveVars(zls.binary, { normalizePath: true });
        zls.debugBinary = zls.debugBinary ? this.varCtx.resolveVars(zls.debugBinary, { normalizePath: true }) : null;
        return zls;
      },
    );
  }

  get zig():     ZigSettings { return this._zig.cfgData; }
  get zls():     ZlsSettings { return this._zls.cfgData; }
  get mainLog(): Logger     { return this._mainLog;     }
  reloadCfg(): void {
    this._zig.reloadCfg();
    this._zls.reloadCfg();
  }
}