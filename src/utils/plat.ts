'use strict';

import * as proc_ from 'process';
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

export function normalizeShellArg(arg: string): string {
  arg = arg.trim();
  // Check if the arg is enclosed in backtick,
  // or includes unescaped double-quotes (or single-quotes on windows),
  // or includes unescaped single-quotes on mac and linux.
  if (/^`.*`$/g.test(arg) || /.*[^\\]".*/g.test(arg) ||
    (isWindows && /.*[^\\]'.*/g.test(arg)) ||
    (!isWindows && /.*[^\\]'.*/g.test(arg))) {
    return arg;
  }
  // The special character double-quote is already escaped in the arg.
  const unescapedSpaces: string | undefined = arg.split('').find((char, index) => index > 0 && char === " " && arg[index - 1] !== "\\");
  if (!unescapedSpaces && !isWindows) {
    return arg;
  } else if (arg.includes(" ")) {
    arg = arg.replace(/\\\s/g, " ");
    return "\"" + arg + "\"";
  } else {
    return arg;
  }
}
