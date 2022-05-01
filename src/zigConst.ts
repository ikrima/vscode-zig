'use strict';

export namespace Const {
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
export namespace Cmd {
  export namespace zls {
    export const start   = "zig.zls.start";
    export const stop    = "zig.zls.stop";
    export const restart = "zig.zls.restart";
  }
  export namespace zig {
    export namespace build {
      export const runStep       = "zig.build.runStep";
      export const lastTarget    = "zig.build.lastTarget";
      export const getLastTarget = "zig.build.getLastTarget";
    }
    export const test = "zig.test";
  }
}