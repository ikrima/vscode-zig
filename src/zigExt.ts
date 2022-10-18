'use strict';
import * as vsc from 'vscode';
import type * as lc from 'vscode-languageclient/node';
import { ZIG, ZLS } from './constants';
import { ConfigSettings, VariableResolver } from './utils/config';
import { assertNever, LogLevel } from './utils/dbg';
import { DisposableBase } from './utils/dispose';
import { consoleLog, Logger } from './utils/logger';
import * as path from './utils/path';
import ZigBuildTaskProvider from './zig/buildTaskProvider';
import ZigCodelensProvider from './zig/codeLensProvider';
import ZigTestTaskProvider from './zig/testTaskProvider';
import ZlsServices from './zls/zlsClient';

export let extCfg: ZigExtConfig;

export class ZigExt extends DisposableBase {
  private static readonly _inst = new ZigExt();
  private zlsServices: ZlsServices | undefined;

  public static async activate(context: vsc.ExtensionContext): Promise<void> {
    if (ZigExt._inst._store.isDisposed || ZigExt._inst._store.hasSubscribers) {
      consoleLog.warn(ZigExt._inst._store.isDisposed
        ? 'ZigExt activate error: extension already deactivated'
        : 'ZigExt activate error: extension already activated');
      return;
    }
    context.subscriptions.push(ZigExt._inst);
    extCfg = new ZigExtConfig(ZigExt._inst._register(vsc.window.createOutputChannel(ZIG.extChanName)));
    ZigExt._inst.zlsServices = ZigExt._inst._register(new ZlsServices());
    ZigExt._inst._register(new ZigCodelensProvider());
    ZigExt._inst._register(new ZigBuildTaskProvider());
    ZigExt._inst._register(new ZigTestTaskProvider());

    const activationPromises: Promise<void>[] = [ZigExt._inst.zlsServices.activate()];
    const results = await Promise.allSettled(activationPromises);
    const errReasons: unknown[] = [];
    for (const p of results) {
      switch (p.status) {
        case 'rejected': errReasons.push(p.reason); break;
        case 'fulfilled': break;
        default: assertNever(p);
      }
    }
    return (errReasons.length === 0)
      ? Promise.resolve()
      : Promise.reject(`Failed to activate extension. Errors: [${errReasons.join(', ')}]`);

  }
  public static async deactivate(): Promise<void> {
    if (ZigExt._inst._store.isDisposed || !ZigExt._inst._store.hasSubscribers) {
      consoleLog.warn(ZigExt._inst._store.isDisposed
        ? 'ZigExt deactivate error: extension already deactivated'
        : 'ZigExt deactivate error: extension was never activated');
      return;
    }
    if (ZigExt._inst.zlsServices) {
      await ZigExt._inst.zlsServices.deactivate();
    }
  }
}

interface ZigSettings {
  binary: string;
  buildRootDir: string;
  buildCacheDir: string;
  buildOutDir: string;
  buildFile: string;
  enableTaskProblemMatcher: boolean;
  enableCodeLens: boolean;
}
interface ZlsSettings {
  binary: string;
  debugBinary: string | null;
  enableDebug: boolean;
  trace: {
    server: {
      verbosity: lc.TraceValues;       // lc.TraceValues;
      format: 'text' | 'json'; // lc.TraceFormat
    };
  };
  enable_snippets: boolean;
  enable_ast_check_diagnostics: boolean;
  enable_import_embedfile_argument_completions: boolean;
  zig_lib_path: string | null;
  zig_exe_path: string | null;
  warn_style: boolean;
  build_runner_path: string | null;
  global_cache_path: string | null;
  enable_semantic_tokens: boolean;
  enable_inlay_hints: boolean;
  inlay_hints_show_builtin: boolean;
  inlay_hints_exclude_single_argument: boolean;
  operator_completions: boolean;
  include_at_in_builtins: boolean;
  max_detail_length: number;
  skip_std_references: boolean;
  builtin_path: string | null;
}
class ZigExtConfig {
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
        zig.binary = this.varCtx.resolveVars(zig.binary, { normalizePath: true });
        zig.buildRootDir = this.varCtx.resolveVars(zig.buildRootDir, { normalizePath: true });
        zig.buildCacheDir = this.varCtx.resolveVars(zig.buildCacheDir, { relBasePath: zig.buildRootDir });
        zig.buildCacheDir = path.isAbsolute(zig.buildCacheDir) ? zig.buildCacheDir : path.join(zig.buildRootDir, zig.buildCacheDir);
        zig.buildOutDir = this.varCtx.resolveVars(zig.buildOutDir, { relBasePath: zig.buildRootDir });
        zig.buildOutDir = path.isAbsolute(zig.buildOutDir) ? zig.buildOutDir : path.join(zig.buildRootDir, zig.buildOutDir);
        zig.buildFile = this.varCtx.resolveVars(zig.buildFile, { relBasePath: zig.buildRootDir });
        return zig;
      },
    );
    this._zls = ConfigSettings.create<ZlsSettings>(
      ZLS.langServerId,
      scope,
      (zls: ZlsSettings): ZlsSettings => {
        zls.binary = this.varCtx.resolveVars(zls.binary, { normalizePath: true });
        zls.debugBinary = zls.debugBinary ? this.varCtx.resolveVars(zls.debugBinary, { normalizePath: true }) : null;
        return zls;
      },
    );
  }

  get zig(): ZigSettings { return this._zig.cfgData; }
  get zls(): ZlsSettings { return this._zls.cfgData; }
  get mainLog(): Logger { return this._mainLog; }
  reloadCfg(): void {
    this._zig.reloadCfg();
    this._zls.reloadCfg();
  }
}