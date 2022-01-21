"use strict";

import { astDiagnostics } from './extension';
import { zigBuild } from './zigBuild';
import * as cp from "child_process";
import * as vscode from "vscode";
// This will be treeshaked to only the debounce function
import { debounce } from "lodash-es";


export default class ZigCompilerProvider implements vscode.CodeActionProvider {
  private dirtyChange = new WeakMap<vscode.Uri, boolean>();

  // public activate(subscriptions: vscode.Disposable[]) {
  //   subscriptions.push(this);
  //   // vscode.workspace.onDidOpenTextDocument(this.doCompile, this, subscriptions);
  //   // vscode.workspace.onDidCloseTextDocument(
  //   //   (textDocument) => {
  //   //     this.diagnosticCollection.delete(textDocument.uri);
  //   //   },
  //   //   null,
  //   //   subscriptions
  //   // );
  //   // vscode.workspace.onDidSaveTextDocument(this.doCompile, this);
  //   vscode.workspace.onDidChangeTextDocument(
  //     this.maybeDoASTGenErrorCheck,
  //     this
  //   );
  // }

  public static register(context: vscode.ExtensionContext): void {
    let compiler = new ZigCompilerProvider();
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider({ language: 'zig', scheme: 'file' }, compiler)
    );

    // context.subscriptions.push(
    //   vscode.window.onDidChangeActiveTextEditor(
    //     (editor) => { if (editor) compiler.doASTGenErrorCheck(editor.document); }
    //   )
    // );
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(
        (change) => { compiler.doASTGenErrorCheck(change.document); }
      )
    );
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(
        (doc) => {
          let config = vscode.workspace.getConfiguration("zig");
          if (
            config.get<boolean>("buildOnSave") &&
            compiler.dirtyChange.has(doc.uri) &&
            compiler.dirtyChange.get(doc.uri) !== doc.isDirty &&
            !doc.isDirty
          ) {
            compiler.doCompile(doc);
          }
          compiler.dirtyChange.set(doc.uri, doc.isDirty);
        }
      )
    );
    context.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument(doc => astDiagnostics.delete(doc.uri))
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('zig.astcheck', (_) => {
        compiler.doASTGenErrorCheck(vscode.window.activeTextEditor.document);
      })
    );
  };

  private _doASTGenErrorCheck(textDocument: vscode.TextDocument) {
    let config = vscode.workspace.getConfiguration("zig");
    if (textDocument.languageId !== "zig") {
      return;
    }
    if (textDocument.isClosed) {
      astDiagnostics.delete(textDocument.uri);
      return;
    }
    const zig_path = config.get("zigPath") || "zig";
    const cwd = vscode.workspace.getWorkspaceFolder(textDocument.uri).uri
      .fsPath;

    let childProcess = cp.spawn(zig_path as string, ["ast-check"], { cwd });

    if (!childProcess.pid) {
      return;
    }

    var stderr = "";
    childProcess.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    childProcess.stdin.end(textDocument.getText(null));

    childProcess.once("close", () => {
      this.doASTGenErrorCheck.cancel();
      astDiagnostics.delete(textDocument.uri);

      if (stderr.length == 0) return;
      var diagnostics: { [id: string]: vscode.Diagnostic[] } = {};
      let regex = /(\S.*):(\d*):(\d*): ([^:]*): (.*)/g;

      for (let match = regex.exec(stderr); match; match = regex.exec(stderr)) {
        let path = textDocument.uri.fsPath;

        let line = parseInt(match[2]) - 1;
        let column = parseInt(match[3]) - 1;
        let type = match[4];
        let message = match[5];

        let severity =
          type.trim().toLowerCase() === "error"
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Information;
        let range = new vscode.Range(line, column, line, Infinity);

        if (diagnostics[path] == null) diagnostics[path] = [];
        diagnostics[path].push(new vscode.Diagnostic(range, message, severity));
      }

      for (let path in diagnostics) {
        let diagnostic = diagnostics[path];
        astDiagnostics.set(textDocument.uri, diagnostic);
      }
    });
  }

  private _doCompile(textDocument: vscode.TextDocument) {
    let childProcess = zigBuild(textDocument);
    if (childProcess.pid) {
      childProcess.stdout.once("close", () => { this.doCompile.cancel(); });
    }
  }

  doASTGenErrorCheck = debounce(this._doASTGenErrorCheck, 16, {
    trailing: true,
  });
  doCompile = debounce(this._doCompile, 60);
  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Command[]> {
    return [];
  }
}
