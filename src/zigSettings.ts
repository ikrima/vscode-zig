import * as vscode from "vscode";
import * as path from 'path';
import * as fs from 'fs';

export const enum BuildOption {
	build    = "build",
	buildExe = "build-exe",
	buildLib = "build-lib",
	buildObj = "build-obj",
}
export interface IZigSettings {
    zigPath:                     string;
    zlsPath:                     string;
    zlsDebugLog:                 boolean;
    buildRootDir:                string;
    buildFilePath:               string;
    buildOption:                 BuildOption;
    buildArgs:                   string[];
    testBinDir:                  string;
    testArgs:                    string[];
    testDbgArgs:                 string[];
    buildOnSave:                 boolean;
    enableProblemMatcherForTest: boolean;
    revealLogOnFormattingError:  boolean;
}

export function getExtensionSettings(): IZigSettings {
	const config            = vscode.workspace.getConfiguration('zig');
    const workspacePath     = vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? "";
    const dfltBuildRootDir  = workspacePath;

    let buildRootDir     = config.get<string>("buildRootDir");
    buildRootDir         = buildRootDir?.replace("${workspaceFolder}", workspacePath);
    buildRootDir         = path.resolve(buildRootDir ?? dfltBuildRootDir);

    let buildFilePath    = config.get<string>("buildFilePath");
    buildFilePath        = buildFilePath?.replace("${workspaceFolder}", workspacePath);
    buildFilePath        = path.resolve(buildFilePath ?? path.join(buildRootDir, "build.zig"));

    let testBinDir     = config.get<string>("testBinDir");
    testBinDir         = testBinDir?.replace("${workspaceFolder}", workspacePath);
    testBinDir         = testBinDir ?? path.join(buildRootDir, "zig-out/bin");

    let buildOption = BuildOption.build;
    switch(config.get<string>("buildOption", "build")) {
        case "build":     buildOption = BuildOption.build; break;
        case "build-exe": buildOption = BuildOption.buildExe; break;
        case "build-lib": buildOption = BuildOption.buildLib; break;
        case "build-obj": buildOption = BuildOption.buildObj; break;
    }
	return {
        zigPath:                     config.get<string>       ( "zigPath",                     "zig.exe"),
        zlsPath:                     config.get<string>       ( "zls.path",                    "zls.exe"),
        zlsDebugLog:                 config.get<boolean>      ( "zls.debugLog",                false),
        buildRootDir:                buildRootDir,
        buildFilePath:               buildFilePath,
        buildOption:                 buildOption,
        buildArgs:                   config.get<string[]>     ( "buildArgs",                   []),
        testBinDir:                  testBinDir,
        testArgs:                    config.get<string[]>     ( "testArgs",                    []),
        testDbgArgs:                 config.get<string[]>     ( "testDbgArgs",                 []),
        buildOnSave:                 config.get<boolean>      ( "buildOnSave",                 false),
        enableProblemMatcherForTest: config.get<boolean>      ( "enableProblemMatcherForTest", true),
        revealLogOnFormattingError:  config.get<boolean>      ( "revealLogOnFormattingError",  true),
	};
}
