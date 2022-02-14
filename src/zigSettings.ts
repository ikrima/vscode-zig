"use strict";

import * as vscode from "vscode";
import * as path from 'path';
import * as process from 'process';

export const enum BuildArtifact {
    build = "build",
    buildExe = "build-exe",
    buildLib = "build-lib",
    buildObj = "build-obj",
}
export interface IZigSettings {
    binPath: string;
    zls: {
        binPath:  string;
        debugLog: boolean;
    };
    build: {
        rootDir:   string;
        buildFile: string;
        artifact:  BuildArtifact;
        extraArgs: string[];
    };
    task: {
        binDir:               string;
        testArgs:             string[];
        debugArgs:            string[];
        enableProblemMatcher: boolean;
    };
    misc: {
        buildOnSave:         boolean;
        revealOnFormatError: boolean;
    };
}

export function getExtensionSettings(): IZigSettings {
    const config           = vscode.workspace.getConfiguration('zig');

    const dfltBuildRootDir = vscode.workspace.workspaceFolders ? path.normalize(vscode.workspace.workspaceFolders[0].uri.fsPath) : "";
    const _buildRootDir    = path.normalize(getConfigVar(config, "build.rootDir", dfltBuildRootDir));
    let   _buildArtifact   = BuildArtifact.build;
    switch (config.get<string>("build.artifact", "build")) {
        case "build":     _buildArtifact = BuildArtifact.build; break;
        case "build-exe": _buildArtifact = BuildArtifact.buildExe; break;
        case "build-lib": _buildArtifact = BuildArtifact.buildLib; break;
        case "build-obj": _buildArtifact = BuildArtifact.buildObj; break;
    }
    return {
        binPath: path.normalize(getConfigVar(config, "binPath", "zig.exe")),
        zls:   {
            binPath:  path.normalize(getConfigVar(config, "zls.binPath", "zls.exe")),
            debugLog: config.get<boolean>("zls.debugLog", false),
        },
        build: {
            rootDir:   _buildRootDir,
            buildFile: path.normalize(getConfigVar(config, "build.buildFile", path.join(_buildRootDir, "build.zig"))),
            artifact:  _buildArtifact,
            extraArgs: getConfigVarArray(config, "build.extraArgs"),
        },
        task: {
            binDir:               path.normalize(getConfigVar(config, "task.binDir", path.join(_buildRootDir, "zig-out/bin"))),
            testArgs:             getConfigVarArray(config, "task.testArgs"),
            debugArgs:            getConfigVarArray(config, "task.debugArgs"),
            enableProblemMatcher: config.get<boolean>("task.enableProblemMatcher", true),
        },
        misc: {
            buildOnSave:         config.get<boolean>("misc.buildOnSave", false),
            revealOnFormatError: config.get<boolean>("misc.revealOnFormatError", true),
        },
    };
}



export function resolveVsCodeVars(rawString: string, recursive: boolean = false): string {
    if (rawString.search(
        /\${(workspaceFolder|workspaceFolderBasename|fileWorkspaceFolder|relativeFile|fileBasename|fileBasenameNoExtension|fileExtname|fileDirname|cwd|pathSeparator|lineNumber|selectedText|env:(.*?)|config:(.*?))}/
    ) === -1) {
        return rawString;
    }

    let result = rawString;
    if (vscode.workspace.workspaceFolders) {
        const workspace = vscode.workspace.workspaceFolders[0];
        result = result
            .replace(/\${workspaceFolder}/g, workspace.uri.fsPath)
            .replace(/\${workspaceFolderBasename}/g, workspace.name);
    }

    if (vscode.window.activeTextEditor) {
        const editor = vscode.window.activeTextEditor;
        const selection = editor.selection;
        const filePath = editor.document.uri.fsPath;
        const parsedPath = path.parse(filePath);
        const relFilePath = vscode.workspace.asRelativePath(editor.document.uri);
        const fileWorkspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath ?? "";

        result = result
            .replace(/\${file}/g, filePath)
            .replace(/\${fileWorkspaceFolder}/g, fileWorkspaceFolder)
            .replace(/\${relativeFile}/g, relFilePath)
            .replace(/\${relativeFileDirname}/g, relFilePath.substring(0, relFilePath.lastIndexOf(path.sep)))
            .replace(/\${fileBasename}/g, parsedPath.base)
            .replace(/\${fileBasenameNoExtension}/g, parsedPath.name)
            .replace(/\${fileExtname}/g, parsedPath.ext)
            .replace(/\${fileDirname}/g, parsedPath.dir.substring(parsedPath.dir.lastIndexOf(path.sep) + 1))
            .replace(/\${cwd}/g, parsedPath.dir)
            .replace(/\${pathSeparator}/g, path.sep)
            .replace(/\${lineNumber}/g, (selection.start.line + 1).toString())
            .replace(/\${selectedText}/g, editor.document.getText(new vscode.Range(selection.start, selection.end)));
    }

    // Resolve environment variables
    result = result.replace(/\${env:(.*?)}/g, (envVar: string) => {
        const envKey = envVar.match(/\${env:(.*?)}/)?.[1];
        const envVal = envKey ? process.env[envKey] : undefined;
        return envVal ?? "";
    });

    // Resolve config variables
    const config = vscode.workspace.getConfiguration();
    result = result.replace(/\${config:(.*?)}/g, (envVar: string) => {
        const envKey = envVar.match(/\${config:(.*?)}/)?.[1];
        return envKey ? config.get(envKey, "") : "";
    });

    return recursive ? resolveVsCodeVars(result, recursive) : result;
}
export function getConfigVar<T>(config: vscode.WorkspaceConfiguration, section: string, defaultVal: T): string | T {
    let configVal = config.get<string>(section);
    return configVal ? resolveVsCodeVars(configVal, false) : defaultVal;
}
export function getConfigVarArray(config: vscode.WorkspaceConfiguration, section: string): string[] {
    return config.get<string[]>(section, []).map(configVal => {
        return resolveVsCodeVars(configVal, false);
    });
}