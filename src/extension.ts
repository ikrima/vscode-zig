'use strict';
import * as vscode from 'vscode';
import * as zigLangClient from './zigLangClient';
import { ZigCodelensProvider } from './zigCodeLensProvider';
import { ZigTaskProvider } from './zigTaskProvider';
import { ZigExtSettings } from './zigSettings';
// import { zigBuild } from './zigBuild';
// import ZigCompilerProvider from './zigCompilerProvider';
// import { ZigFormatProvider, ZigRangeFormatProvider } from './zigFormat';
// import { stringify } from 'querystring';

export function activate(context: vscode.ExtensionContext) {
    // let zigFormatStatusBar: vscode.StatusBarItem;
    // zigFormatStatusBar = vscode.window.createStatusBarItem("zig.statusBar", vscode.StatusBarAlignment.Left);
    // zigFormatStatusBar.name = "zig build";
    // zigFormatStatusBar.text = "$(wrench) zig build workspace";
    // zigFormatStatusBar.tooltip = "zig build workspace";
    // zigFormatStatusBar.command = "zig.build.workspace";
    // zigFormatStatusBar.show();
    const logChannel = vscode.window.createOutputChannel(ZigExtSettings.languageId);
    const buildDiagnostics = vscode.languages.createDiagnosticCollection('zigBld');
    context.subscriptions.push(
        logChannel,
        buildDiagnostics,
        zigLangClient.activate(),
        vscode.languages.registerCodeLensProvider(
            { language: ZigExtSettings.languageId, scheme: 'file' },
            new ZigCodelensProvider(context),
        ),
        vscode.tasks.registerTaskProvider(ZigTaskProvider.TaskType, new ZigTaskProvider(context, logChannel)),
    );

    // context.subscriptions.push(
    //     vscode.languages.registerCodeActionsProvider(
    //         { language: ZigExtSettings.languageId, scheme: 'file' },
    //         new ZigCompilerProvider(context)
    //     ),
    //     vscode.languages.registerDocumentFormattingEditProvider(
    //         { language: ZigExtSettings.languageId, scheme: 'file' },
    //         new ZigFormatProvider(logChannel),
    //     ),
    //     vscode.languages.registerDocumentRangeFormattingEditProvider(
    //         { language: ZigExtSettings.languageId, scheme: 'file' },
    //         new ZigRangeFormatProvider(logChannel),
    //     ),
    //     vscode.commands.registerCommand('zig.build.workspace', () => {
    //         if (!vscode.window.activeTextEditor) { return; }
    //         zigBuild(vscode.window.activeTextEditor.document, buildDiagnostics, logChannel);
    //     }),
    // );
}
