'use strict';

export namespace ExtConst {
  export const languageId            = 'zig';
  export const extensionId           = 'zig';
  export const documentSelector      = [{ language: 'zig', scheme: 'file' }];
  export const taskProviderSourceStr = 'zig';
  export const buildTaskType         = 'zigbuild';
  export const testTaskType          = 'zigtest';
  export const problemMatcher        = '$zig';
  export const zlsDiagnosticsName    = 'zls';
  export const cppToolsExtId         = "ms-vscode.cpptools";
  export const lldbExtId             = "vadimcn.vscode-lldb";
}
export namespace CmdConst {
  export const zls = {
    start:   "zig.zls.start",
    stop:    "zig.zls.stop",
    restart: "zig.zls.restart",
  };
  export const zig = {
    pickBuildStep:       "zig.pickBuildStep",
    build:               "zig.build",
    buildLastTarget:     "zig.buildLastTarget",
    test:                "zig.test",
  };
}