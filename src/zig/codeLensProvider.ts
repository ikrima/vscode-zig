'use strict';
import * as vsc from 'vscode';
import { ZIG } from '../constants';
import { CharCode } from '../utils/charCode';
import { DisposableBase } from '../utils/dispose';
import * as strings from '../utils/strings';
import { extCfg } from '../zigExt';
import type { ZigTestStep } from './zigStep';

export default class ZigCodelensProvider extends DisposableBase implements vsc.CodeLensProvider {
  private readonly changeEmitter: vsc.EventEmitter<void> = this._register(new vsc.EventEmitter<void>());
  readonly onDidChangeCodeLenses: vsc.Event<void> = this.changeEmitter.event;
  private codeLenses: vsc.CodeLens[] = [];

  constructor() {
    super();
    this._registerMany(
      vsc.workspace.onDidChangeConfiguration(evt => {
        if (evt.affectsConfiguration(ZIG.extensionId)) {
          extCfg.reloadCfg();
          this.changeEmitter.fire();
        }
      }),
      vsc.languages.registerCodeLensProvider(ZIG.documentSelector, this),
    );
  }

  async provideCodeLenses(
    document: vsc.TextDocument,
    token: vsc.CancellationToken
  ): Promise<vsc.CodeLens[] | null> {
    if (!extCfg.zig.enableCodeLens) { return null; }
    this.codeLenses = [];
    const text = document.getText();

    for (let i = 0; i < text.length; i++) {
      const possibleTestKeyword = text.indexOf("test", i);
      if (possibleTestKeyword === -1) { break; }
      if (token.isCancellationRequested) { break; }

      const previousWord =
        possibleTestKeyword > -1
          ? text[possibleTestKeyword - 1].trimStart()
          : null;

      if (strings.isNotEmpty(previousWord) && previousWord.charCodeAt(0) !== CharCode.CloseCurlyBrace) {
        i = possibleTestKeyword + 4;
        continue;
      }

      switch (text[possibleTestKeyword + 5].trimStart().charCodeAt(0)) {
        case CharCode.DoubleQuote:
        case CharCode.OpenCurlyBrace:
          break;
        default: {
          i = possibleTestKeyword + 5;
          continue;
        }
      }

      // test "foo"
      // ^
      if (text.length > possibleTestKeyword + 4) {
        const nextCurlyBrace = text.indexOf(String.fromCharCode(CharCode.OpenCurlyBrace), possibleTestKeyword);
        if (nextCurlyBrace === -1) {
          i = possibleTestKeyword + 4;
          continue;
        }

        i = possibleTestKeyword + 4;
        while (
          i < text.length &&
          text.charCodeAt(i) === CharCode.Space &&
          !token.isCancellationRequested
        ) {
          i++;
        }

        if (i > nextCurlyBrace) { continue; }

        if (text.charCodeAt(i) === CharCode.DoubleQuote) {
          const quoteStart = i;
          i++;

          while (
            i < text.length &&
            text.charCodeAt(i) !== CharCode.DoubleQuote &&
            !token.isCancellationRequested
          ) {
            if (text.charCodeAt(i) === CharCode.Backslash && text.charCodeAt(i + 1) === CharCode.DoubleQuote) {
              i += 1;
            }
            i += 1;
          }
          i++;

          const quoteEnd = i;

          if (token.isCancellationRequested) { return []; }

          const line = document.lineAt(document.positionAt(possibleTestKeyword).line);
          this.codeLenses.push(
            new vsc.CodeLens(line.rangeIncludingLineBreak, {
              title: "Run test",
              command: ZIG.CmdId.runTest,
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
            new vsc.CodeLens(line.rangeIncludingLineBreak, {
              title: "Debug test",
              command: ZIG.CmdId.runTest,
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
        new vsc.CodeLens(line.range, {
          title: "Run all tests in file (and imports)",
          command: ZIG.CmdId.runTest,
          arguments: [
            {
              buildArgs: { testSrcFile: document.uri.fsPath },
              runArgs: { debugLaunch: false },
            } as ZigTestStep
          ],
        })
      );
    }

    return Promise.resolve(this.codeLenses);
  }
}
