'use strict';

import * as cp from 'child_process';
import * as vscode from 'vscode';
import { zigConst } from "./zigConst";
import { zigContext, BuildStep } from "./zigContext";

export function zigBuild(
    textDocument: vscode.TextDocument,
    buildDiagnostics: vscode.DiagnosticCollection,
    logChannel: vscode.OutputChannel,
): cp.ChildProcess | null {
    if (textDocument.languageId !== zigConst.languageId) { return null; }
    const workspaceFolder =
        vscode.workspace.getWorkspaceFolder(textDocument.uri)
        ?? (vscode.workspace.workspaceFolders
            ? vscode.workspace.workspaceFolders[0]
            : null);
    if (!workspaceFolder) { return null; }
    const zigCfg = zigContext.getConfig();
    const workspacePath = workspaceFolder.uri.fsPath;
    const cwd = workspacePath;

    let processArg: string[] = [];
    switch (zigCfg.buildBuildStep) {
        case BuildStep.buildFile:
            processArg.push("--build-file", zigCfg.buildBuildFile);
            break;
        default:
            processArg.push(textDocument.fileName);
            break;
    }
    processArg.push(...zigCfg.buildExtraArgs);
    logChannel.clear();
    logChannel.appendLine(`Starting building the current workspace at ${cwd}`);

    return cp.execFile(zigCfg.zigBinPath, processArg, { cwd }, (_err, _stdout, stderr) => {
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




//  class ZigBuildHelper {
//    private cachedSteps: ZigBldStep[] | null = null;
//    private cachedPick: ZigBldStep | null = null;
//    public async getBuildSteps(forceReload: boolean): Promise<ZigBldStep[]> {
//      if (forceReload || !this.cachedSteps) {
//        const zig = zig_cfg.zig;
//        if (!await fs.fileExists(zig.buildFile)) {
//          zig_logger.error("Aborting build target fetch. No build.zig file found in workspace root.");
//          return Promise.reject();
//        }
//        try {
//          const { stdout, stderr } = await cp.execFile(
//            zig.binary,
//            [
//              "build",
//              "--help",
//              ...[`--build-file`, zig.buildFile],
//            ],
//            {
//              encoding: 'utf8',
//              cwd: zig.buildRootDir,
//              shell: vsc.env.shell,
//            }
//          );
//
//          if (types.isNonBlank(stderr)) {
//            zig_logger.error(`zig build errors\n${stderr}`);
//            return Promise.reject();
//          }
//          const stepsIdx = stdout.indexOf("Steps:");
//          const genOpIdx = stdout.indexOf("General Options:", stepsIdx);
//          const stepsStr = stdout.substring(stepsIdx, genOpIdx);
//          this.cachedSteps = Array.from(
//            stepsStr.matchAll(stepsRegEx),
//            (m: RegExpMatchArray, _): ZigBldStep => {
//              return {
//                kind: 'zigBldStep',
//                stepName: m[1],
//                stepDesc: m[3],
//                isDefault: types.isDefined(m[2])
//              };
//            },
//          );
//
//        }
//        catch (e) {
//          zig_logger.error('zig build errors', e);
//          return Promise.reject();
//        }
//
//      }
//      return this.cachedSteps;
//    }
//    public async pickBuildStep(forcePick: boolean): Promise<ZigBldStep | null> {
//      if (forcePick || !this.cachedPick) {
//        type StepPickItem = { step: ZigBldStep } & vsc.QuickPickItem;
//        // const steps = await this.getBuildSteps(forcePick);
//        // const stepItems = Array.from(steps, (s): StepPickItem => {
//        //   return {
//        //     step: s,
//        //     label: s.stepName,
//        //     description: s.stepDesc,
//        //   };
//        // });
//        const stepItems = this
//          .getBuildSteps(false)
//          .then(steps => {
//            return steps.map(s => {
//              step: s,
//              label: s.stepName,
//              description: s.stepDesc,
//            });
//          });
//        const picked = await vsc.window.showQuickPick(
//          stepItems,
//          {
//            canPickMany: false,
//            placeHolder: "Select the zig target to run",
//          },
//        );
//        if (!picked) { return null; }
//        this.cachedPick = picked.step;
//      }
//      return this.cachedPick;
//    }
//  }
//
// class ZigBuildTerminal implements vsc.Pseudoterminal {
//   private writeEmitter = new vsc.EventEmitter<string>();
//   private closeEmitter = new vsc.EventEmitter<number>();
//   onDidWrite: vsc.Event<string> = this.writeEmitter.event;
//   onDidClose: vsc.Event<number> = this.closeEmitter.event;
//   private buildProc?: cp.ProcessRun | undefined;
//
//   constructor(
//     private readonly shellCmd: string,
//     private readonly shellArgs?: string[],              // Any arguments
//     private readonly cwd?: string,              // Current working directory
//   ) { }
//
//   // At this point we can start using the terminal.
//   async open(_initialDimensions: vsc.TerminalDimensions | undefined): Promise<void> {
//     try {
//       // Do build.
//       const processRun = cp.runProcess(
//         this.shellCmd,
//         {
//           shellArgs: this.shellArgs,
//           cwd: this.cwd,
//           logger: zig_logger,
//           onStart: () => this.emitLine("Starting build..."),
//           onStdout: (str) => this.splitWriteEmitter(str),
//           onStderr: (str) => this.splitWriteEmitter(str),
//         }
//       );
//       // Emit Resolved command
//       this.emitLine(processRun.procCmd);
//       this.buildProc = processRun;
//       const { stdout, stderr } = await processRun.completion;
//
//       // printBuildSummary
//       const hasStdOut = !strings.isWhiteSpace(stdout);
//       const hasStdErr = !strings.isWhiteSpace(stderr);
//       if (
//         (!hasStdOut && hasStdErr && stderr.includes("error"))
//         || (hasStdOut && stdout.includes("error"))
//       ) {
//         this.emitLine("Build finished with error(s)");
//       } else if (
//         (!hasStdOut && hasStdErr && stderr.includes("warning"))
//         || (hasStdOut && stdout.includes("warning"))
//       ) {
//         this.emitLine("Build finished with warning(s)");
//       } else {
//         this.emitLine("Build finished successfully");
//       }
//       this.buildProc = undefined;
//       this.closeEmitter.fire(0);
//     }
//     catch (e) {
//       this.buildProc = undefined;
//       this.emitLine("Build run was terminated");
//       const stdout = (e as cp.ProcRunException)?.stdout;
//       const stderr = (e as cp.ProcRunException)?.stderr;
//       if (e) { this.splitWriteEmitter(String(e)); }
//       if (stdout) { this.splitWriteEmitter(stdout); }
//       if (stderr) { this.splitWriteEmitter(stderr); }
//       this.closeEmitter.fire(-1);
//     }
//   }
//
//   // The terminal has been closed. Shutdown the build.
//   close(): void {
//     if (!this.buildProc || !this.buildProc.isRunning()) { return; }
//     this.buildProc.kill();
//     this.buildProc = undefined;
//     this.emitLine("Build run was cancelled");
//   }
//
//   private emitLine(text: string) {
//     this.writeEmitter.fire(text);
//     this.writeEmitter.fire(crlfString);
//   }
//   private splitWriteEmitter(lines: string | Buffer) {
//     const splitLines: string[] = lines.toString().split(eolRegEx);
//     for (let i = 0; i < splitLines.length; i++) {
//       let line = splitLines[i];
//       // We may not get full lines, only output an eol when a full line is detected
//       if (i !== splitLines.length - 1) { line += crlfString; }
//       this.writeEmitter.fire(line);
//     }
//   }
// }