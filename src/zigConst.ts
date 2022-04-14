'use strict';

export namespace ExtConst {
  export const languageId            = 'zig';
  export const extensionId           = 'zig';
  export const documentSelector      = [{ language: 'zig', scheme: 'file' }];
  export const taskProviderSourceStr = 'zig';
  export const taskType              = 'zig';
  export const testTaskType          = 'zigTest';
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
    chooseBuildStep:     "zig.chooseBuildStep",
    lastChosenStepOrAsk: "zig.lastChosenStepOrAsk",
    build:               "zig.build",
    buildLastTarget:     "zig.buildLastTarget",
    test:                "zig.test",
  };
}