'use strict';
import * as vscode from 'vscode';
import fs from 'fs';
import YAML from 'js-yaml';
import path from 'path';
import { ZigLanguageClient } from './zigLangClient';
import ZigCompilerProvider from './zigCompilerProvider';
import ZigCodelensProvider from './zigCodeLensProvider';
import { zigBuild } from './zigBuild';
import { ZigFormatProvider, ZigRangeFormatProvider } from './zigFormat';

let buildDiagnostics: vscode.DiagnosticCollection;
let logChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    // let zigFormatStatusBar: vscode.StatusBarItem;
    // zigFormatStatusBar = vscode.window.createStatusBarItem("zig.statusBar", vscode.StatusBarAlignment.Left);
    // zigFormatStatusBar.name = "zig build";
    // zigFormatStatusBar.text = "$(wrench) zig build workspace";
    // zigFormatStatusBar.tooltip = "zig build workspace";
    // zigFormatStatusBar.command = "zig.build.workspace";
    // zigFormatStatusBar.show();

    logChannel = vscode.window.createOutputChannel('zig');
    buildDiagnostics = vscode.languages.createDiagnosticCollection('zigBld');
    context.subscriptions.push(buildDiagnostics);

    ZigLanguageClient.activate();
    // ZigCompilerProvider.register(context);
    ZigCodelensProvider.register();


    context.subscriptions.push(logChannel);
    // context.subscriptions.push(
    //     vscode.languages.registerDocumentFormattingEditProvider(
    //         vscode.DocumentFilter{ language: 'zig', scheme: 'file' },
    //         new ZigFormatProvider(logChannel),
    //     ),
    // );
    // context.subscriptions.push(
    //     vscode.languages.registerDocumentRangeFormattingEditProvider(
    //         vscode.DocumentFilter{ language: 'zig', scheme: 'file' },
    //         new ZigRangeFormatProvider(logChannel),
    //     ),
    // );


    // Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('zig.build.workspace', () => zigBuild(vscode.window.activeTextEditor.document, buildDiagnostics, logChannel))
    );

    const resolveTask = function resolveTask(task: vscode.Task, token) {
        if (!task.presentationOptions) {
            task.presentationOptions = {};
        }

        const isDebug = task.definition.task === 'debug';

        task.presentationOptions.clear = true;
        if (typeof task.presentationOptions.reveal === 'undefined') {
            task.presentationOptions.reveal = isDebug
                ? vscode.TaskRevealKind.Silent
                : vscode.TaskRevealKind.Always;
        }

        task.presentationOptions.showReuseMessage = false;
        task.presentationOptions.echo = true;

        const workspaceFolder = task.scope as vscode.WorkspaceFolder;

        const filename = task.definition.file as vscode.Uri;
        const filter = task.definition.filter as string;
        const config = vscode.workspace.getConfiguration('zig');
        const bin = config.get<string>('zigPath') || 'zig';
        const testCmd = (config.get<string>(isDebug ? 'beforeDebugCmd' : 'testCmd') || "")
            .split(" ")
            .filter(Boolean);

        let femitBinPath = (task.definition.bin || "") as string;

        if (!femitBinPath || femitBinPath.trim().length === 0) {
            const testBinDir = config.get<string>("testBinDir") || "${workspaceFolder}/zig-out/bin";

            femitBinPath = path.join(
                testBinDir.replace("${workspaceFolder}", workspaceFolder.uri.fsPath),
                `test-${path.basename(workspaceFolder.uri.fsPath)}.exe`
            );

            femitBinPath = path.resolve(femitBinPath);
        }

        // delete the old bin so know if the test failed to build
        // its okay if it doesn't exist though
        try {
            if (femitBinPath) fs.rmSync(femitBinPath);
        } catch (exception) { }

        const relativeFilename =
            filename && path.relative(workspaceFolder.uri.fsPath, filename.fsPath);
        if (testCmd && testCmd.length > 0) {
            for (let i = 0; i < testCmd.length; i++) {
                if (testCmd[i] === "${filename}") {
                    if (relativeFilename) {
                        testCmd[i] = relativeFilename;
                    } else {
                        testCmd.splice(i, 1);
                    }
                }

                if (testCmd[i] === "${filter}") {
                    if (filter && filter.length > 0) {
                        testCmd[i] = filter;
                    } else {
                        testCmd.splice(i, 1);
                    }
                }

                if (testCmd[i] === "${bin}") {
                    if (femitBinPath && femitBinPath.length > 0) {
                        testCmd[i] = femitBinPath;
                    } else {
                        testCmd.splice(i, 1);
                    }
                }
            }
        }

        const testOptions = (task.definition.args as string) || "";

        let joined = "";

        if (testCmd && testCmd.length > 0) {
            joined = testCmd.filter(Boolean).join(" ");
        } else {

            if (femitBinPath.endsWith('"')) {
                femitBinPath = femitBinPath.substring(0, femitBinPath.length - 1);
            }

            if (femitBinPath.length === 0 ||
                femitBinPath === "/" ||
                femitBinPath === "." ||
                femitBinPath === "/dev" ||
                femitBinPath === "C:\\" ||
                femitBinPath === "C:\\Windows"
            ) {
                femitBinPath = null;
            }

            const femitArg = `-femit-bin=${femitBinPath}`;

            var main_package_path = "";
            try {
                main_package_path = path.resolve(
                    workspaceFolder.uri.fsPath,
                    "build.zig"
                );
            } catch { }

            const args = [
                bin,
                "test",
                main_package_path.length &&
                `--main-pkg-path ${workspaceFolder.uri.fsPath}`,
                femitArg,
                relativeFilename,
                ...getObjectFiles(filename),
                filter && filter.length > 0 && `--test-filter ${filter}`,
                testOptions,
                isDebug && `--test-no-exec`,
            ].filter((a) => Boolean(a));

            joined = args.join(" ");
        }

        task.problemMatchers = !config.get("disableProblemMatcherForTest")
            ? ["zig"]
            : [];
        task.execution = new vscode.ShellExecution(joined, {});
        logChannel.appendLine(`Test command: ${joined}`);

        return task;
    };

    function getObjectFiles(filename: vscode.Uri): string[] {
        const contents = fs.readFileSync(filename.fsPath, "utf8");
        var i = 0;
        const objectFiles = [];

        return objectFiles;
    }
    var lastTestCommand;

    context.subscriptions.push(
        vscode.tasks.registerTaskProvider("zig", {
            provideTasks: (token) => {
                return [
                    new vscode.Task(
                        { type: "zig", task: "test" },
                        vscode.workspace.workspaceFolders[0],
                        "test",
                        "zig",
                        new vscode.ShellExecution("zig test")
                    ),
                    new vscode.Task(
                        { type: "zig", task: "debug" },
                        vscode.workspace.workspaceFolders[0],
                        "debug",
                        "zig",
                        new vscode.ShellExecution("zig test")
                    ),
                ];
            },
            resolveTask,
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("zig.test.run", (filename: vscode.Uri, filter: string) => {
                const task = new vscode.Task(
                    { type: "zig", task: "test" },
                    vscode.workspace.workspaceFolders[0],
                    "test",
                    "zig",
                    new vscode.ShellExecution("zig test")
                );
                task.detail = "zig test";

                const config = vscode.workspace.getConfiguration("zig");

                task.definition.file = filename;

                task.definition.filter = filter;
                task.definition.args = (config.get<string>("testArgs") || "").replace(
                    /\$\{workspaceFolder\}/gm,
                    vscode.workspace.workspaceFolders[0].uri.fsPath
                );
                lastTestCommand = { filename, filter };
                const resolved = resolveTask(task, null);
                vscode.tasks.executeTask(resolved);
                vscode.commands.executeCommand(
                    "setContext",
                    "zig.hasLastTestCommand",
                    true
                );
            }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("zig.test.rerun", (cmd) => {
            if (lastTestCommand) {
                vscode.commands.executeCommand(
                    "zig.test.run",
                    lastTestCommand.filename,
                    lastTestCommand.filter
                );
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("zig.test.rerun.debug", (cmd) => {
            if (lastTestCommand) {
                vscode.commands.executeCommand(
                    "zig.test.debug",
                    lastTestCommand.filename,
                    lastTestCommand.filter
                );
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("zig.test.debug", (filename: vscode.Uri, filter: string) => {
                lastTestCommand = { filename, filter };
                const config = vscode.workspace.getConfiguration("zig");

                let workspaceFolder = vscode.workspace.getWorkspaceFolder(filename);
                if (!workspaceFolder && vscode.workspace.workspaceFolders.length) {
                    workspaceFolder = vscode.workspace.workspaceFolders[0];
                }
                const cwd = workspaceFolder.uri.fsPath;

                const cppToolsExtension = vscode.extensions.getExtension("ms-vscode.cpptools");
                const cppToolsExtActive = cppToolsExtension && cppToolsExtension.isActive;
                const codeLLDBExtension = vscode.extensions.getExtension("vadimcn.vscode-lldb");
                const codeLLDBExtActive = codeLLDBExtension && codeLLDBExtension.isActive;
                if (!cppToolsExtActive && !codeLLDBExtActive) {
                    logChannel.appendLine("cpptools/vscode-lldb extension must be enabled or installed.");
                    logChannel.show();
                    return;
                }

                logChannel.clear();

                const testBinDir = config.get<string>("testBinDir") || "${workspaceFolder}/zig-out/bin";

                let femitBinPath = path.join(
                    testBinDir.replace("${workspaceFolder}", cwd),
                    `test-${path.basename(cwd)}.exe`
                );

                // delete the old bin so know if the test failed to build
                // its okay if it doesn't exist though
                try {
                    fs.rmSync(femitBinPath);
                    femitBinPath = path.resolve(femitBinPath);
                } catch (exception) { }

                const task = resolveTask(
                    new vscode.Task(
                        {
                            type: "zig",
                            task: "debug",
                            filter,
                            file: filename,
                            bin: femitBinPath,
                        },
                        workspaceFolder,
                        "debug",
                        "zig",
                        new vscode.ShellExecution("zig test")
                    ),
                    undefined
                );

                var handler = vscode.tasks.onDidEndTask((event) => {
                    if (event.execution.task.name !== "debug") return;
                    handler.dispose();
                    handler = null;
                    if (!fs.existsSync(femitBinPath))
                        return;

                    const zigPath = config.get<string>('zigPath') || 'zig';
                    if (cppToolsExtActive) {
                        return vscode.debug.startDebugging(
                            workspaceFolder,
                            {
                                type: 'cppvsdbg',
                                name: `Zig Test Debug`,
                                request: 'launch',
                                program: femitBinPath,
                                args: Array.isArray(config.get("debugArgs")) &&
                                    config.get<Array<string>>("debugArgs").length > 0
                                    ? config.get("debugArgs")
                                    : [zigPath],
                                cwd: workspaceFolder,
                                console: 'integratedTerminal',
                            },
                        ).then((a) => { });
                    } else {
                        const launch = Object.assign(
                            {},
                            {
                                type: "lldb",
                                request: "launch",
                                name: "Zig Test Debug",
                                program: femitBinPath,
                                args:
                                    Array.isArray(config.get("debugArgs")) &&
                                        config.get<Array<string>>("debugArgs").length > 0
                                        ? config.get("debugArgs")
                                        : [zigPath],
                                cwd: workspaceFolder,
                                internalConsoleOptions: "openOnSessionStart",
                                terminal: "console",
                            }
                        );

                        var yaml = YAML.dump(launch, {
                            condenseFlow: true,
                            forceQuotes: true,
                        });

                        if (yaml.endsWith(","))
                            yaml = yaml.substring(0, yaml.length - 1);

                        return vscode.env
                            .openExternal(vscode.Uri.parse(`${vscode.env.uriScheme}://vadimcn.vscode-lldb/launch/config?${yaml}`))
                            .then((a) => { });
                    }
                });
                vscode.tasks.executeTask(task).then(() => { });
            }
        )
    );
}

export function deactivate() {
    ZigLanguageClient.deactivate();
    buildDiagnostics.clear();
    buildDiagnostics.dispose();
    logChannel.clear();
    logChannel.dispose();
}
