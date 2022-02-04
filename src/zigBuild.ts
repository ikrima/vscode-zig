"use strict";

import * as cp from 'child_process';
import * as vscode from 'vscode';

export function zigBuild(
    textDocument: vscode.TextDocument,
    buildDiagnostics: vscode.DiagnosticCollection,
    logChannel: vscode.OutputChannel,
): cp.ChildProcess | null {
    if (textDocument.languageId !== 'zig') { return null; }
    const workspaceFolder =
        vscode.workspace.getWorkspaceFolder(textDocument.uri)
        ?? (vscode.workspace.workspaceFolders
            ? vscode.workspace.workspaceFolders[0]
            : null);
    if (!workspaceFolder) { return null; }

    const config = vscode.workspace.getConfiguration('zig');
    const zigPath = config.get<string>("zigPath", 'zig');
    const extraArgs = config.get<string[]>("buildArgs", []);
    const buildOption = config.get<string>("buildOption", "build");
    const workspacePath = workspaceFolder.uri.fsPath;
    const buildFilePath = config.get<string>("buildFilePath", `${workspacePath}/build.zig`).replace("${workspaceFolder}", workspacePath);
    const cwd = workspacePath;

    let processArg: string[] = [];
    switch (buildOption) {
        case "build":
            processArg.push(
                "--build-file",
                require("path").resolve(buildFilePath)
            );
            break;
        default:
            processArg.push(textDocument.fileName);
            break;
    }
    processArg.push(...extraArgs);
    logChannel.clear();
    logChannel.appendLine(`Starting building the current workspace at ${cwd}`);

    return cp.execFile(zigPath, processArg, { cwd }, (_err, _stdout, stderr) => {
        logChannel.appendLine(stderr);
        var diagnostics: { [id: string]: vscode.Diagnostic[]; } = {};
        let regex = /(\S.*):(\d*):(\d*): ([^:]*): (.*)/g;

        buildDiagnostics.clear();
        for (
            let match = regex.exec(stderr);
            match;
            match = regex.exec(stderr)
        ) {
            let path = match[1].trim();
            try {
                if (!path.includes(cwd)) {
                    path = require("path").resolve(cwd, path);
                }
            } catch {
            }

            let line = parseInt(match[2]) - 1;
            let column = parseInt(match[3]) - 1;
            let type = match[4];
            let message = match[5];

            let severity = type.trim().toLowerCase() === "error" ?
                vscode.DiagnosticSeverity.Error :
                vscode.DiagnosticSeverity.Information;

            let range = new vscode.Range(line, column, line, Infinity);

            diagnostics[path] = diagnostics[path] ?? [];
            diagnostics[path].push(new vscode.Diagnostic(range, message, severity));
        }

        for (let path in diagnostics) {
            let diagnostic = diagnostics[path];
            buildDiagnostics.set(vscode.Uri.file(path), diagnostic);
        }
    });
}
