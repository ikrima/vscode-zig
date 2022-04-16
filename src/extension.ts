'use strict';
import * as vscode from 'vscode';
import { ExtConst } from "./zigConst";
import { ZigExt,  ZigExtConfig } from './zigContext'; 
import { ZlsContext } from './zigLangClient';
import { log } from './utils';
import * as zig_code_lens from './zigCodeLensProvider';
import { zig_build, zig_test } from './zigTaskProvider';

type ZigExtState = {
    extContext: vscode.ExtensionContext;
    extChannel: vscode.OutputChannel;
    logger: log.Logger;
    zigCfg: ZigExtConfig;
    registrations: vscode.Disposable[];
    zlsContext?: ZlsContext;
};
let zigExtState: ZigExtState;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const extChannel = vscode.window.createOutputChannel(ExtConst.extensionId);
    zigExtState = {
        extContext: context,
        extChannel: extChannel,
        logger: log.makeChannelLogger(log.LogLevel.warn, extChannel),
        zigCfg: new ZigExtConfig(),
        registrations: [],
    };
    ZigExt.logger = zigExtState.logger;
    ZigExt.zigCfg = zigExtState.zigCfg;


    zigExtState.zlsContext = new ZlsContext();
    zigExtState.registrations.push(
        zig_code_lens.createCodeLensProvider(),
        zig_build.createTaskProvider(),
        zig_test.createTaskProvider(),
    );
    await zigExtState.zlsContext.startClient();
}
export async function deactivate(): Promise<void> {
    zigExtState.registrations.forEach(d => void d.dispose());
    zigExtState.registrations = [];
    await zigExtState.zlsContext?.dispose();
    zigExtState.extChannel?.dispose();
}