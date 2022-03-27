'use strict';

export namespace ZigConst {
    export const languageId            = 'zig';
    export const extensionId           = 'zig';
    export const documentSelector      = [{ language: 'zig', scheme: 'file' }];
    export const taskProviderSourceStr = 'zig';
    export const taskScriptType        = 'zig';
    export const problemMatcher        = '$zig';
    export const zlsDiagnosticsName    = 'zls';
}