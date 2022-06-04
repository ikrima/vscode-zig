'use strict';

export namespace Const {
  export const languageId            = 'zig';
  export const extensionId           = 'zig';
  export const zigChanName           = 'zig';
  export const documentSelector      = [{ language: 'zig', scheme: 'file' }];
  export const taskProviderSourceStr = 'zig';
  export const zigBuildTaskType      = 'zig_build';
  export const zigTestTaskType       = 'zig_test';
  export const problemMatcher        = '$zig';
  export const zlsChanName           = 'zls';
  export const zlsDiagnosticsName    = 'zls';
}
export namespace CmdId {
  export namespace zls {
    export const start   = "zig.zls.start";
    export const stop    = "zig.zls.stop";
    export const restart = "zig.zls.restart";
  }
  export namespace zig {
    export namespace build {
      export const runStep       = "zig.build.runStep";
      export const runLastTarget = "zig.build.runLastTarget";
      export const getLastTarget = "zig.build.getLastTarget";
    }
    export const runTest = "zig.runTest";
  }
}