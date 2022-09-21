'use strict';

import * as proc_ from 'process';
export { EOL as eol, homedir } from 'os';
export { cwd, env } from 'process';
export type  EnvVars     = Record<string, string | undefined>; // alias of NodeJS.ProcessEnv, Record<string, string | undefined> === Dict<string>
export const isWindows   = proc_.platform === 'win32';
export const isMacintosh = proc_.platform === 'darwin';
export const isLinux     = proc_.platform === 'linux';

export function expandEnvironmentVariables(str: string): string {
  return str.replace(/%([^%]+)%/g, (match, varName: string) => {
      return proc_.env[varName] ?? match;
  });
}
