'use strict';
import * as vscode from 'vscode';
import  { ZlsContext } from './zigLangClient';
import { ZigCodelensProvider } from './zigCodeLensProvider';
import { ZigTaskProvider } from './zigTaskProvider';
import { ZigConfig } from './zigConfig';
// import { zigBuild } from './zigBuild';
// import ZigCompilerProvider from './zigCompilerProvider';
// import { ZigFormatProvider, ZigRangeFormatProvider } from './zigFormat';
// import { stringify } from 'querystring';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // let zigFormatStatusBar: vscode.StatusBarItem;
    // zigFormatStatusBar = vscode.window.createStatusBarItem("zig.statusBar", vscode.StatusBarAlignment.Left);
    // zigFormatStatusBar.name = "zig build";
    // zigFormatStatusBar.text = "$(wrench) zig build workspace";
    // zigFormatStatusBar.tooltip = "zig build workspace";
    // zigFormatStatusBar.command = "zig.build.workspace";
    // zigFormatStatusBar.show();

    const logChannel = vscode.window.createOutputChannel(ZigConfig.languageId);
    context.subscriptions.push(logChannel);

    const zlsContext = new ZlsContext;
    context.subscriptions.push(zlsContext);
    await zlsContext.startClient();

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            ZigConfig.zigDocumentSelector,
            new ZigCodelensProvider(context),
        ),
        vscode.tasks.registerTaskProvider(ZigTaskProvider.TaskType, new ZigTaskProvider(context, logChannel)),
    );

    // const buildDiagnostics = vscode.languages.createDiagnosticCollection('zigBld');
    // context.subscriptions.push(
    //     vscode.languages.registerCodeActionsProvider(
    //         ZigConfig.zigDocumentSelector,
    //         new ZigCompilerProvider(context)
    //     ),
    //     vscode.languages.registerDocumentFormattingEditProvider(
    //         ZigConfig.zigDocumentSelector,
    //         new ZigFormatProvider(logChannel),
    //     ),
    //     vscode.languages.registerDocumentRangeFormattingEditProvider(
    //         ZigConfig.zigDocumentSelector,
    //         new ZigRangeFormatProvider(logChannel),
    //     ),
    //     vscode.commands.registerCommand('zig.build.workspace', () => {
    //         if (!vscode.window.activeTextEditor) { return; }
    //         zigBuild(vscode.window.activeTextEditor.document, buildDiagnostics, logChannel);
    //     }),
    // );
}
