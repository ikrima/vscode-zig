/* eslint-disable @typescript-eslint/naming-convention */
'use strict';
import * as vscode from "vscode";
import { ext, Logger, LogLevel, path } from './utils';
import { DisposableCollection } from './utils/dispose';
import { Const } from './zigConst';
import { registerLangClient } from './zigLangClient';
import { registerBuildTaskProvider } from './task/buildTaskProvider';
import { registerTestTaskProvider } from './task/testTaskProvider';
import { registerCodeLensProvider } from "./zigCodeLensProvider";

export namespace zig_ext {
  export let extContext: vscode.ExtensionContext;
  export let logger: Logger;
  export let zigCfg: ZigExtConfig;
  const subscriptions = new DisposableCollection();
  export async function activate(context: vscode.ExtensionContext): Promise<void> {
    extContext = context;
    const extChannel = vscode.window.createOutputChannel(Const.extensionId);
    logger = Logger.channelLogger(extChannel, LogLevel.warn);
    zigCfg = new ZigExtConfig();
    subscriptions.add(...(
      await Promise.all([
        registerLangClient(),
        registerCodeLensProvider(),
        registerBuildTaskProvider(),
        registerTestTaskProvider(),
      ]))
    );
  }
  export function deactivate() {
    subscriptions.dispose();
  }

}

export interface ZlsConfigData {
  binary: string;
  debugBinary: string | null;
  enableDebug: boolean;
}
export interface ZigConfigData {
  binary: string;
  buildRootDir: string;
  buildFile: string;
  enableTaskProblemMatcher: boolean;
  zls: ZlsConfigData;
}
export class ZigExtConfig extends ext.ExtensionConfigBase<ZigConfigData> {
  constructor(scope?: vscode.ConfigurationScope | null) {
    super(
      Const.extensionId,
      scope,
      (zig: ZigConfigData): void => {
        const varCtx = new ext.VariableResolver();
        zig.binary = varCtx.resolveVars(zig.binary, { normalizePath: true });
        zig.buildRootDir = varCtx.resolveVars(zig.buildRootDir, { normalizePath: true });    // ext.defaultWksFolderPath() ?? ""          );
        zig.buildFile = varCtx.resolveVars(zig.buildFile, { relBasePath: zig.buildRootDir });       // path.join(this.build_rootDir,"build.zig") );
        zig.zls.binary = varCtx.resolveVars(zig.zls.binary, { normalizePath: true });
        zig.zls.debugBinary = zig.zls.debugBinary ? varCtx.resolveVars(zig.zls.debugBinary, { normalizePath: true }) : null;
      },
    );
  }

  get zig():     ZigConfigData { return this._cfgData;                                      }
  get outDir():  string        { return path.join(this.zig.buildRootDir, "zig-out", "bin"); }
  get cacheDir():string        { return path.join(this.zig.buildRootDir, "zig-cache" );     }
}
