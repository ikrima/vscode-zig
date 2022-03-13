'use strict';

export namespace ZigConst {
    export const languageId            = 'zig';
    export const extensionId           = 'zig';
    export const documentSelector      = [{ language: languageId, scheme: 'file' }];
    export const taskProviderSourceStr = languageId;  // eslint-disable-line @typescript-eslint/naming-convention
    export const taskScriptType        = languageId;  // eslint-disable-line @typescript-eslint/naming-convention
    export const problemMatcher        = '$zig';      // eslint-disable-line @typescript-eslint/naming-convention
    export const zlsDiagnosticsName    = 'zls';
}