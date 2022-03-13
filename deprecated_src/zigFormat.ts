'use strict';
import * as vscode from 'vscode';
import { TextEdit, OutputChannel } from 'vscode';
import { execCmd,ExecutingCmd } from './zigUtil';
import { zigContext } from "./zigContext";

export class ZigFormatProvider implements vscode.DocumentFormattingEditProvider {
    private _channel: OutputChannel;
    constructor(logChannel: OutputChannel) {
        this._channel = logChannel;
    }

    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        _options?: vscode.FormattingOptions,
        _token?: vscode.CancellationToken,
    ): Thenable<TextEdit[]> {
        const logger = this._channel;
        const zigCfg = zigContext!.getConfig();
        return zigFormat(document)
            .then(({ stdout }) => {
                logger.clear();
                const lastLineId = document.lineCount - 1;
                const wholeDocument = new vscode.Range(
                    0,
                    0,
                    lastLineId,
                    document.lineAt(lastLineId).text.length,
                );
                return [new TextEdit(wholeDocument, stdout)];
            })
            .catch((reason) => {
                logger.clear();
                logger.appendLine(reason.toString().replace('<stdin>', document.fileName));
                if (zigCfg.miscRevealOnFormatError) {
                    logger.show(true);
                }
                return [];
            });
    }
}

// Same as full document formatter for now
export class ZigRangeFormatProvider implements vscode.DocumentRangeFormattingEditProvider {
    private _channel: OutputChannel;
    constructor(logChannel: OutputChannel) {
        this._channel = logChannel;
    }

    provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        _range: vscode.Range,
        _options?: vscode.FormattingOptions,
        _token?: vscode.CancellationToken,
    ): Thenable<TextEdit[]> {
        const logger = this._channel;
        const zigCfg = zigContext.getConfig();
        return zigFormat(document)
            .then(({ stdout }) => {
                const lastLineId = document.lineCount - 1;
                const wholeDocument = new vscode.Range(
                    0,
                    0,
                    lastLineId,
                    document.lineAt(lastLineId).text.length,
                );
                return [new TextEdit(wholeDocument, stdout),];
            })
            .catch((reason) => {

                logger.clear();
                logger.appendLine(`Formatting Error`);
                logger.appendLine(reason.toString().replace('<stdin>', document.fileName));
                if (zigCfg.miscRevealOnFormatError) {
                    logger.show(true);
                }
                return [];
            });
    }
}

function zigFormat(document: vscode.TextDocument): ExecutingCmd  {
    const zigCfg = zigContext.getConfig();

    const options = {
        cmdArguments: ['fmt', '--stdin'],
        fileName: document.uri,
        notFoundText: 'Could not find zig. Please add zig to your PATH or specify a custom path to the zig binary in your settings.',
    };
    const format = execCmd(zigCfg.zigBinPath, options);

    format.stdin?.write(document.getText());
    format.stdin?.end();

    return format;
}
