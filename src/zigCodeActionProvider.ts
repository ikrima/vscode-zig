"use strict";

import { zigBuild } from './zigBuild';
import * as cp from "child_process";
import * as vscode from "vscode";
import { ZigConfig } from "./zigConfig";
// This will be treeshaked to only the debounce function
import { debounce } from "lodash-es";


export default class ZigCodeActionProvider implements vscode.CodeActionProvider, vscode.Disposable {
  private dirtyChange = new WeakMap<vscode.Uri, boolean>();
  private astDiagnostics: vscode.DiagnosticCollection;
  private _buildDiagnostics: vscode.DiagnosticCollection;
  private _channel: vscode.OutputChannel;
  constructor(buildDiagnostics: vscode.DiagnosticCollection, logChannel: vscode.OutputChannel) {
    this._channel = logChannel;
    this._buildDiagnostics = buildDiagnostics;
    this.astDiagnostics = vscode.languages.createDiagnosticCollection('zigAst');
  }

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

  public static register(
    context: vscode.ExtensionContext,
    buildDiagnostics: vscode.DiagnosticCollection,
    logChannel: vscode.OutputChannel,
  ): void {
    let compiler = new ZigCodeActionProvider(buildDiagnostics, logChannel);
    context.subscriptions.push(compiler.astDiagnostics);
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(ZigConfig.zigDocumentSelector, compiler)
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
          const zigCfg = ZigConfig.get();
          if (
            zigCfg.miscBuildOnSave &&
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
      vscode.workspace.onDidCloseTextDocument(doc => compiler.astDiagnostics.delete(doc.uri))
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('zig.astcheck', (_) => {
        if (!vscode.window.activeTextEditor) { return; }
        compiler.doASTGenErrorCheck(vscode.window.activeTextEditor.document);
      })
    );
  };

  private _doASTGenErrorCheck(textDocument: vscode.TextDocument) {
    const zigCfg = ZigConfig.get();
    if (textDocument.languageId !== ZigConfig.languageId) {
      return;
    }
    if (textDocument.isClosed) {
      this.astDiagnostics.delete(textDocument.uri);
      return;
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(textDocument.uri);
    if (!workspaceFolder) { return; }
    const cwd = workspaceFolder.uri.fsPath;

    let childProcess = cp.spawn(zigCfg.zigBinPath, ["ast-check"], { cwd });

    if (!childProcess.pid) {
      return;
    }

    var stderr = "";
    childProcess.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    childProcess.stdin.end(textDocument.getText());

    childProcess.once("close", () => {
      this.doASTGenErrorCheck.cancel();

      if (stderr.length === 0) { return; }
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

        diagnostics[path] = diagnostics[path] ?? [];
        diagnostics[path].push(new vscode.Diagnostic(range, message, severity));
      }

      for (let path in diagnostics) {
        let diagnostic = diagnostics[path];
        this.astDiagnostics.set(textDocument.uri, diagnostic);
      }
    });
  }

  dispose(): void {
    this.astDiagnostics.clear();
    this.astDiagnostics.dispose();
  }

  private _doCompile(textDocument: vscode.TextDocument) {
    let childProcess = zigBuild(textDocument, this._buildDiagnostics, this._channel);
    if (childProcess && childProcess.pid && childProcess.stdout) {
      childProcess.stdout.once("close", () => { this.doCompile.cancel(); });
    }
  }

  doASTGenErrorCheck = debounce(this._doASTGenErrorCheck, 16, {
    trailing: true,
  });
  doCompile = debounce(this._doCompile, 60);
  public provideCodeActions(
    _document: vscode.TextDocument,
    _range: vscode.Range,
    _context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Command[]> {
    return [];
  }
}
