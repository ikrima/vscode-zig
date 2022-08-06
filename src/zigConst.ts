'use strict';

export namespace Const {
  export namespace zig {
    export const languageId            = 'zig';
    export const extensionId           = 'zig';
    export const extChanName           = 'zig';
    export const documentSelector      = [{ language: 'zig', scheme: 'file' }];
    export const taskProviderSourceStr = 'zig';
    export const buildTaskType         = 'zig_build';
    export const testTaskType          = 'zig_test';
    export const problemMatcher        = '$zig';
  }
  export namespace zls {
    export const langServerId        = 'zls';
    export const diagnosticsName     = 'zls';
    export const outChanName         = 'zls';
    export const traceChanName       = 'zls trace';
  }
}
export namespace CmdId {
  export namespace zig {
    export namespace build {
      export const runStep       = "zig.build.runStep";
      export const runLastTarget = "zig.build.runLastTarget";
      export const getLastTarget = "zig.build.getLastTarget";
    }
    export const runTest = "zig.runTest";
  }
  export namespace zls {
    export const start   = "zls.start";
    export const stop    = "zls.stop";
    export const restart = "zls.restart";
  }
}