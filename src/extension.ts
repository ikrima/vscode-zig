'use strict';
import type * as vscode from 'vscode';
import { ZigContext } from './zigContext';
// import { zigBuild } from './zigBuild';
// import { ZigCodeActionProvider } from './zigCodeActionProvider';
// import { ZigFormatProvider, ZigRangeFormatProvider } from './zigFormat';
// import { stringify } from 'querystring';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    ZigContext.activate(context);
    return Promise.resolve();
}

export async function deactivate(): Promise<void> {
    ZigContext.deactivate();
}