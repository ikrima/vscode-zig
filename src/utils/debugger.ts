/* eslint-disable @typescript-eslint/naming-convention */
'use strict';
import * as vsc from 'vscode';
import { isExtensionActive } from '../utils/ext';
import { ScopedError } from './logger';


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
): Promise<boolean> {
  if (!Debugger.isActive(Debugger.vsdbg)) { throw ScopedError.make("cpptools extension must be enabled or installed"); }
  const debugConfig: vsc.DebugConfiguration = {
    type: 'cppvsdbg',
    request: 'launch',
    ...target,
  };
  return await vsc.debug.startDebugging(folder ?? vsc.workspace.workspaceFolders?.[0], debugConfig);
}

export async function launchLLDB(_target: ExecutableTarget): Promise<boolean> {
  if (!Debugger.isActive(Debugger.lldb)) { throw ScopedError.make("vscode-lldb extension must be enabled or installed."); }
  return Promise.reject(ScopedError.make("codeLLDB temporarily disabled"));
}