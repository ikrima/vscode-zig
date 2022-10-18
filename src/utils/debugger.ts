'use strict';
import * as vsc from 'vscode';
import { ScopedError } from './dbg';
import { isExtensionActive } from './vsc';

export interface ExecutableTarget {
  name:              string;
  program:           string;
  args?:             string[] | undefined;
  cwd?:              string | undefined;
  console?:          "internalConsole" | "integratedTerminal" | "externalTerminal" | "newExternalWindow";
}
export interface VsDbgConfig extends ExecutableTarget {
  environment?:      { name: string; value: string }[];
  envFile?:          string;
  symbolSearchPath?: string;
  stopAtEntry?:      boolean;
  enableDebugHeap?:  boolean;
  visualizerFile?:   string;
  logging?:          {
    exceptions?:    boolean;
    moduleLoad?:    boolean;
    programOutput?: boolean;
    engineLogging?: boolean;
    threadExit?:    boolean;
    processExit?:   boolean;
  };
}
export enum Debugger {
  vsdbg,
  lldb,
}
export namespace Debugger {

  export const cppToolsExtId = 'ms-vscode.cpptools';
  export const lldbExtId     = 'vadimcn.vscode-lldb';
  export function isActive(kind: Debugger): boolean {
    switch(kind) {
      case Debugger.vsdbg: return isExtensionActive(Debugger.cppToolsExtId);
      case Debugger.lldb:  return isExtensionActive(Debugger.lldbExtId);
    }
  }
}

export async function launchVsDbg(
  target: VsDbgConfig,
  folder?: vsc.WorkspaceFolder | undefined
): Promise<void> {
  if (!Debugger.isActive(Debugger.vsdbg)) {
    return ScopedError.reject("cpptools extension must be enabled or installed");
  }
  const debugConfig: vsc.DebugConfiguration = {
    type: 'cppvsdbg',
    request: 'launch',
    ...target,
  };
  return vsc.debug.startDebugging(folder ?? vsc.workspace.workspaceFolders?.[0], debugConfig).then(
    started => started ? Promise.resolve() : ScopedError.reject("could not launch cpptools debug instance"),
    err => ScopedError.reject("Could not launch cppvsdbg debug instance", err)
  );

}

export async function launchLLDB(_target: ExecutableTarget): Promise<void> {
  if (!Debugger.isActive(Debugger.lldb)) {
    return ScopedError.reject("vscode-lldb extension must be enabled or installed.");
  }
  return ScopedError.reject("codeLLDB temporarily disabled");
}