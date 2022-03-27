'use strict';
import type * as vscode from 'vscode';
import { initZigContext, deinitZigContext } from './zigContext';
// import { zigBuild } from './zigBuild';
// import { ZigCodeActionProvider } from './zigCodeActionProvider';
// import { ZigFormatProvider, ZigRangeFormatProvider } from './zigFormat';
// import { stringify } from 'querystring';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    void initZigContext(context);
    return Promise.resolve();
}

export async function deactivate(): Promise<void> {
    await deinitZigContext();
}