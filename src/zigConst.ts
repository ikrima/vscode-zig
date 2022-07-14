'use strict';

export namespace Const {
  export const languageId            = 'zig';
  export const extensionId           = 'zig';
  export const langServerId          = 'zls';
  export const zigChanName           = 'zig';
  export const documentSelector      = [{ language: 'zig', scheme: 'file' }];
  export const taskProviderSourceStr = 'zig';
  export const zigBuildTaskType      = 'zig_build';
  export const zigTestTaskType       = 'zig_test';
  export const problemMatcher        = '$zig';
  export namespace zls {
    export const outChanName         = 'zls';
    export const traceChanName       = 'zls server trace';
    export const diagnosticsName     = 'zls';
  }
}
export namespace CmdId {
  export namespace zls {
    export const start   = "zls.start";
    export const stop    = "zls.stop";
    export const restart = "zls.restart";
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