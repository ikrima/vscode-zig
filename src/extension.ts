'use strict';
import * as vscode from 'vscode';
import { ZlsContext } from './zigLangClient';
import { ZigCodelensProvider } from './zigCodeLensProvider';
import { ZigTaskProvider } from './zigTaskProvider';
import { ZigConfig } from './zigConfig';
// import { zigBuild } from './zigBuild';
// import { ZigCodeActionProvider } from './zigCodeActionProvider';
// import { ZigFormatProvider, ZigRangeFormatProvider } from './zigFormat';
// import { stringify } from 'querystring';

// The extension deactivate method is asynchronous, so we handle the disposables ourselves instead of using extensonContext.subscriptions
class ZigExtension {
    extContext:          vscode.ExtensionContext;
    zlsContext:          ZlsContext;
    zigChannel:          vscode.OutputChannel;
    zigCodeLensProvider: ZigCodelensProvider;
    zigTaskProvider:     ZigTaskProvider;
    registrations:       vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.extContext          = context;
        this.zigChannel          = vscode.window.createOutputChannel(ZigConfig.extensionId);
        this.zlsContext          = new ZlsContext();
        this.zigCodeLensProvider = new ZigCodelensProvider();
        this.zigTaskProvider     = new ZigTaskProvider(this.zigChannel);
        this.registrations.push(
            vscode.languages.registerCodeLensProvider (ZigConfig.zigDocumentSelector, this.zigCodeLensProvider),
            vscode.tasks.registerTaskProvider         (ZigTaskProvider.TaskType,      this.zigTaskProvider),
        );

        // let zigFormatStatusBar: vscode.StatusBarItem;
        // zigFormatStatusBar = vscode.window.createStatusBarItem("zig.statusBar", vscode.StatusBarAlignment.Left);
        // zigFormatStatusBar.name = "zig build";
        // zigFormatStatusBar.text = "$(wrench) zig build workspace";
        // zigFormatStatusBar.tooltip = "zig build workspace";
        // zigFormatStatusBar.command = "zig.build.workspace";
        // zigFormatStatusBar.show();
        // const buildDiagnostics = vscode.languages.createDiagnosticCollection('zigBld');
        // context.subscriptions.push(
        //     vscode.languages.registerCodeActionsProvider(
        //         ZigConfig.zigDocumentSelector,
        //         new ZigCodeActionProvider(context)
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

    async activate() {
        this.zlsContext.startClient();
    }

    async deactivate() {
        this.registrations.forEach(d => d.dispose());
        this.registrations = [];
        this.zigTaskProvider.dispose();
        this.zigCodeLensProvider.dispose();
        await this.zlsContext.dispose();
        this.zigChannel.dispose();
    }

};
let zigExtension: ZigExtension | undefined;

export async function activate(context: vscode.ExtensionContext) {
    zigExtension = new ZigExtension(context);
    await zigExtension.activate();
}

export async function deactivate() {
    if (!zigExtension) { return; }
    await zigExtension.deactivate();
    zigExtension = undefined;
}