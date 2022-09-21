'use strict';
import type { ChildProcess, ExecException, ExecFileException, ExecFileOptions } from 'child_process';
import * as cp_ from 'child_process';
import { promisify } from 'util';
import type { Logger } from './logging';
import * as path from './path';
import * as plat from './plat';
import * as strings from './strings';
import * as types from './types';

export { execFileSync, type ChildProcess, type ExecException, type ExecFileException } from 'child_process';
export const execFile = promisify(cp_.execFile );
export const spawn    = promisify(cp_.spawn    );

export function isExecException(o: unknown): o is ExecException {
  return types.isObject(o)
    && types.isNativeError(o)
    && ( (types.isString (o['cmd'   ]) ||  'cmd'    in o)
      || (types.isBoolean(o['killed']) ||  'killed' in o)
      || (types.isNumber (o['code'  ]) ||  'code'   in o)
      || (types.isString (o['signal']) ||  'signal' in o)
    );
}
export function isErrnoException(o: unknown): o is NodeJS.ErrnoException {
  return types.isObject(o)
    && types.isNativeError(o)
    && ( (types.isNumber(o['errno'  ]) || 'errno'   in o)
      || (types.isString(o['code'   ]) || 'code'    in o)
      || (types.isString(o['path'   ]) || 'path'    in o)
      || (types.isString(o['syscall']) || 'syscall' in o)
    );
}
export function isExecFileException(o: unknown): o is ExecFileException {
  return isExecException(o) && isErrnoException(o);
}

export async function terminateProcess(childProcess: ChildProcess): Promise<boolean> {
  if (!childProcess?.pid) { return Promise.resolve(false); }

  if (plat.isWindows) {
    return execFile(
      'taskkill',
      ['/T', '/F', '/PID', childProcess.pid.toString()]
    ).then(_ => true, _ => false);
  }
  else if (plat.isLinux || plat.isMacintosh) {
    return execFile(
      path.join(__dirname, 'terminateProcess.sh'),
      [childProcess.pid.toString()],
      { encoding: 'utf8', shell: true } as ExecFileOptions
    ).then(_ => true, _ => false);
  }
  else {
    childProcess.kill('SIGKILL');
    return true;
  }
}

export function normalizeShellArg(arg: string): string {
  arg = arg.trim();
  // Check if the arg is enclosed in backtick,
  // or includes unescaped double-quotes (or single-quotes on windows),
  // or includes unescaped single-quotes on mac and linux.
  if (/^`.*`$/g.test(arg) || /.*[^\\]".*/g.test(arg) ||
    (plat.isWindows && /.*[^\\]'.*/g.test(arg)) ||
    (!plat.isWindows && /.*[^\\]'.*/g.test(arg))) {
    return arg;
  }
  // The special character double-quote is already escaped in the arg.
  const unescapedSpaces: string | undefined = arg.split('').find((char, index) => index > 0 && char === " " && arg[index - 1] !== "\\");
  if (!unescapedSpaces && !plat.isWindows) {
    return arg;
  } else if (arg.includes(" ")) {
    arg = arg.replace(/\\\s/g, " ");
    return "\"" + arg + "\"";
  } else {
    return arg;
  }
}

// A promise for running process and also a wrapper to access ChildProcess-like methods
export interface ProcessRunOptions {
  shellArgs?: string[];              // Any arguments
  cwd?: string;                      // Current working directory
  logger?: Logger;                   // Shows a message if an error occurs (in particular the command not being found), instead of rejecting. If this happens, the promise never resolves
  onStart?: () => void;              // Called after the process successfully starts
  onStdout?: (data: string) => void; // Called when data is sent to stdout
  onStderr?: (data: string) => void; // Called when data is sent to stderr
  onExit?: () => void;               // Called after the command (successfully or unsuccessfully) exits
  notFoundText?: string;             // Text to add when command is not found (maybe helping how to install)
}
export type ProcessRun = {
  procCmd: string;
  childProcess: ChildProcess | undefined;
  isRunning: () => boolean;
  kill: () => Promise<void>;
  completion: Promise<{ stdout: string; stderr: string }>;
};
export interface ProcRunException extends ExecException {
  stdout?: string | undefined;
  stderr?: string | undefined;
}
// Spawns cancellable process
export function runProcess(cmd: string, options: ProcessRunOptions = {}): ProcessRun {
  let firstResponse = true;
  let wasKilledbyUs = false;
  let isRunning = true;
  let childProcess: ChildProcess | undefined;
  const procCmd = strings.concatNotEmpty(strings.SpaceSep, [
    cmd,
    ...(options.shellArgs ?? [])
  ].map(normalizeShellArg));
  return {
    procCmd: procCmd,
    childProcess: childProcess,
    isRunning: () => isRunning,
    kill: async () => {
      if (childProcess) { wasKilledbyUs = await terminateProcess(childProcess); }
      else { wasKilledbyUs = false; }
    },
    completion: new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      childProcess = cp_.exec(
        procCmd,
        { cwd: options.cwd }, // options.cwd ?? vsc.workspace.workspaceFolders?.[0].uri.fsPath,
        (err: ExecException | null, stdout: string, stderr: string): void => {
          isRunning = false;
          if (options.onExit) { options.onExit(); }
          childProcess = undefined;
          if (wasKilledbyUs || !err) {
            resolve({ stdout, stderr });
          } else {
            if (options.logger) {
              const cmdName = cmd.split(strings.SpaceSep, 1)[0];
              const cmdWasNotFound = plat.isWindows
                ? err.message.includes(`'${cmdName}' is not recognized`)
                : err?.code === 127;
              options.logger.error(
                cmdWasNotFound
                  ? (options.notFoundText ?? `${cmdName} is not available in your path;`)
                  : err.message
              );
            }
            reject(Object.assign(
              (err ?? { name: "RunException", message: "Unknown" }) as ProcRunException,
              { stdout: stdout, stderr: stderr }
            ));
          }
        },
      );
      childProcess.stdout?.on('data', (data: Buffer) => {
        if (firstResponse && options.onStart) { options.onStart(); }
        firstResponse = false;
        if (options.onStdout) { options.onStdout(data.toString()); }
      });
      childProcess.stderr?.on('data', (data: Buffer) => {
        if (firstResponse && options.onStart) { options.onStart(); }
        firstResponse = false;
        if (options.onStderr) { options.onStderr(data.toString()); }
      });
    }),
  };
}
