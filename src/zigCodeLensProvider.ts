'use strict';
import * as vscode from "vscode";
import { ExtConst, CmdConst } from "./zigConst";


class ZigCodelensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
  private codeLenses: vscode.CodeLens[] = [];
  private registrations: vscode.Disposable[] = [];

  dispose(): void {
    this.registrations.forEach(d => void d.dispose());
    this.registrations = [];
    this._onDidChangeCodeLenses.dispose();
  }
  register() {
    this.registrations.push(
      vscode.languages.registerCodeLensProvider(ExtConst.documentSelector, this),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(ExtConst.extensionId)) {
          this._onDidChangeCodeLenses.fire();
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

          const line = document.lineAt(
            document.positionAt(possibleTestKeyword).line
          );

          this.codeLenses.push(
            new vscode.CodeLens(line.rangeIncludingLineBreak, {
              title: "Run test",
              command: CmdConst.zig.test,
              arguments: [
                document.uri.fsPath,
                text.substring(quoteStart + 1, quoteEnd - 1),
                false,
              ],
              tooltip: "Run this test via zig test",
            })
          );

          this.codeLenses.push(
            new vscode.CodeLens(line.rangeIncludingLineBreak, {
              title: "Debug test",
              command: CmdConst.zig.test,
              arguments: [
                document.uri.fsPath,
                text.substring(quoteStart + 1, quoteEnd - 1),
                true,
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
          arguments: [document.uri.fsPath, "", false],
        })
      );
    }

    return this.codeLenses;
  }
}


export function createCodeLensProvider(): vscode.Disposable {
  const zigCodeLensProvider = new ZigCodelensProvider();
  zigCodeLensProvider.register();
  return zigCodeLensProvider;
}