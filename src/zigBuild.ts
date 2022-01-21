"use strict";

import { buildDiagnostics, logChannel } from './extension';
import * as cp from 'child_process';
import * as vscode from 'vscode';

export function zigBuild(textDocument: vscode.TextDocument): cp.ChildProcess {
    if (textDocument.languageId !== 'zig') {
        return;
    }

    const config = vscode.workspace.getConfiguration('zig');
    const buildOption = config.get<string>("buildOption");
    let processArg: string[] = [buildOption];
    let workspaceFolder = vscode.workspace.getWorkspaceFolder(textDocument.uri);
    if (!workspaceFolder && vscode.workspace.workspaceFolders.length) {
      workspaceFolder = vscode.workspace.workspaceFolders[0];
    }
    const cwd = workspaceFolder.uri.fsPath;

    switch (buildOption) {
        case "build":
          let buildFilePath = config.get<string>("buildFilePath");
          processArg.push("--build-file");
          try {
            processArg.push(
                require("path").resolve(buildFilePath.replace("${workspaceFolder}", cwd))
            );
          } catch {}

          break;
        default:
            processArg.push(textDocument.fileName);
            break;
    }

    let extraArgs = config.get<string[]>("buildArgs");;
    extraArgs.forEach(element => {
        processArg.push(element);
    });

    const zigPath = config.get<string>("zigPath") || 'zig';

    logChannel.clear();
    logChannel.appendLine(`Starting building the current workspace at ${cwd}`);

    return cp.execFile(zigPath, processArg, { cwd }, (err, stdout, stderr) => {
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

            if (diagnostics[path] == null) diagnostics[path] = [];
            diagnostics[path].push(new vscode.Diagnostic(range, message, severity));
        }

        for (let path in diagnostics) {
            let diagnostic = diagnostics[path];
            buildDiagnostics.set(vscode.Uri.file(path), diagnostic);
        }
    });
}
