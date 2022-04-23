'use strict';
import * as vscode from 'vscode';
import { ExtConst } from "./zigConst";
import { ZigExt,  ZigExtConfig } from './zigContext';
import { ZlsContext } from './zigLangClient';
import { Logger, LogLevel } from './utils';
import * as zig_code_lens from './zigCodeLensProvider';
import { createBuildTaskProvider } from './task/buildTaskProvider';
import { createTestTaskProvider } from './task/testTaskProvider';

type ZigExtState = {
    extContext: vscode.ExtensionContext;
    extChannel: vscode.OutputChannel;
    logger: Logger;
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
        logger: Logger.channelLogger(extChannel, LogLevel.warn),
        zigCfg: new ZigExtConfig(),
        registrations: [],
    };
    ZigExt.logger = zigExtState.logger;
    ZigExt.zigCfg = zigExtState.zigCfg;


    zigExtState.zlsContext = new ZlsContext();
    zigExtState.registrations.push(
        zig_code_lens.createCodeLensProvider(),
        createBuildTaskProvider(),
        createTestTaskProvider(),
    );
    await zigExtState.zlsContext.startClient();
}
export async function deactivate(): Promise<void> {
    zigExtState.registrations.forEach(d => void d.dispose());
    zigExtState.registrations = [];
    await zigExtState.zlsContext?.dispose();
    zigExtState.extChannel?.dispose();
}