'use strict';
import * as vscode from "vscode";


export class ZigCodelensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(_ => this._onDidChangeCodeLenses.fire())
    );
  }
  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
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
          ? text[possibleTestKeyword - 1].trimLeft()
          : "";

      if (!(previousWord === "" || previousWord === "}")) {
        i = possibleTestKeyword + 4;
        continue;
      }

      switch (text[possibleTestKeyword + 5].trimLeft()) {
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
              command: "zig.test.run",
              arguments: [
                document.uri,
                `"${text.substring(quoteStart + 1, quoteEnd - 1)}"`,
              ],
              tooltip: "Run this test via zig test",
            })
          );

          this.codeLenses.push(
            new vscode.CodeLens(line.rangeIncludingLineBreak, {
              title: "Debug test",
              command: "zig.test.debug",
              arguments: [
                document.uri,
                `"${text.substring(quoteStart + 1, quoteEnd - 1)}"`,
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
          command: "zig.test.run",
          arguments: [document.uri, ""],
        })
      );
    }

    return this.codeLenses;
  }
}
