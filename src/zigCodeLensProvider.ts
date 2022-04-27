'use strict';
import * as vscode from "vscode";
import { ExtConst, CmdConst } from "./zigConst";
import type { ZigTestStep } from "./task/zigStep";
import { Disposable } from './utils/dispose';


class ZigCodelensProvider extends Disposable implements vscode.CodeLensProvider {
  public onDidChangeCodeLenses?: vscode.Event<void>;
  private codeLenses: vscode.CodeLens[] = [];

  register() {
    const onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
    this.onDidChangeCodeLenses = onDidChangeCodeLensesEmitter.event;
    this.addDisposables(
      onDidChangeCodeLensesEmitter,
      vscode.languages.registerCodeLensProvider(ExtConst.documentSelector, this),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(ExtConst.extensionId)) {
          onDidChangeCodeLensesEmitter.fire();
        }
      }),
    );
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    this.codeLenses = [];
    const text = document.getText();

    for (let i = 0; i < text.length; i++) {
      const possibleTestKeyword = text.indexOf("test", i);
      if (possibleTestKeyword === -1) { break; }
      if (token && token.isCancellationRequested) { break; }

      const previousWord =
        possibleTestKeyword > -1
          ? text[possibleTestKeyword - 1].trimStart()
          : "";

      if (!(previousWord === "" || previousWord === "}")) {
        i = possibleTestKeyword + 4;
        continue;
      }

      switch (text[possibleTestKeyword + 5].trimStart()) {
        case '"':
        case "{":
          break;
        default: {
          i = possibleTestKeyword + 5;
          continue;
        }
      }

      // test "foo"
      // ^
      if (text.length > possibleTestKeyword + 4) {
        const nextCurlyBrace = text.indexOf("{", possibleTestKeyword);
        if (nextCurlyBrace === -1) {
          i = possibleTestKeyword + 4;
          continue;
        }

        i = possibleTestKeyword + 4;
        while (
          i < text.length &&
          text[i] === " " &&
          !token.isCancellationRequested
        ) {
          i++;
        }

        if (i > nextCurlyBrace) { continue; }

        if (text[i] === '"') {
          const quoteStart = i;
          i++;

          while (
            i < text.length &&
            text[i] !== '"' &&
            !token.isCancellationRequested
          ) {
            if (text[i] === "\\" && text[i + 1] === '"') {
              i += 1;
            }
            i += 1;
          }
          i++;

          const quoteEnd = i;

          if (token.isCancellationRequested) { return []; }

          const line = document.lineAt(document.positionAt(possibleTestKeyword).line);
          this.codeLenses.push(
            new vscode.CodeLens(line.rangeIncludingLineBreak, {
              title: "Run test",
              command: CmdConst.zig.test,
              arguments: [
                {
                  buildArgs: { testSrcFile: document.uri.fsPath },
                  runArgs: {
                    debugLaunch: false,
                    testFilter: text.substring(quoteStart + 1, quoteEnd - 1),
                  },
                } as ZigTestStep
              ],
              tooltip: "Run this test via zig test",
            }),
            new vscode.CodeLens(line.rangeIncludingLineBreak, {
              title: "Debug test",
              command: CmdConst.zig.test,
              arguments: [
                {
                  buildArgs: { testSrcFile: document.uri.fsPath },
                  runArgs: {
                    debugLaunch: true,
                    testFilter: text.substring(quoteStart + 1, quoteEnd - 1),
                  },
                } as ZigTestStep
              ],
              tooltip: "Run this test via zig test",
            })
          );

          i = nextCurlyBrace + 1;
        }
      }
    }

    if (this.codeLenses.length > 0) {
      const line = document.lineAt(document.positionAt(0).line);
      this.codeLenses.push(
        new vscode.CodeLens(line.range, {
          title: "Run all tests in file (and imports)",
          command: CmdConst.zig.test,
          arguments: [
            {
              buildArgs: { testSrcFile: document.uri.fsPath },
              runArgs: { debugLaunch: false },
            } as ZigTestStep
          ],
        })
      );
    }

    return this.codeLenses;
  }
}


export function registerCodeLensProvider(): vscode.Disposable {
  const zigCodeLensProvider = new ZigCodelensProvider();
  zigCodeLensProvider.register();
  return zigCodeLensProvider;
}