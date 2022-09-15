'use strict';

import * as fs_ from 'fs';
import * as path from './path';
import * as plat from './plat';
import { isWhiteSpace } from './strings';
export { constants } from 'fs';

export const mkdir     = fs_.promises.mkdir;
export const readdir   = fs_.promises.readdir;
export const readFile  = fs_.promises.readFile;
export const writeFile = fs_.promises.writeFile;
export const copyFile  = fs_.promises.copyFile;
export const unlink    = fs_.promises.unlink;

export function fileExistsSync(p: string): boolean { return fs_.statSync(p, { throwIfNoEntry: false })?.isFile() as boolean; }
export function dirExistsSync (p: string): boolean { return fs_.statSync(p, { throwIfNoEntry: false })?.isDirectory() as boolean; }

export async function fileAccess (p: string, permission: number): Promise<boolean> { return !isWhiteSpace(p) && fs_.promises.access(p, permission).then(_ => true, _ => false); }
export async function fileStat   (p: string): Promise<fs_.Stats|undefined>         { return !isWhiteSpace(p) ? await fs_.promises.stat(p).catch(_ => undefined) : undefined; }
export async function pathExists (p: string): Promise<boolean>                     { return await fileAccess(p, fs_.constants.F_OK); }
export async function fileExists (p: string): Promise<boolean>                     { return (await fileStat(p))?.isFile() as boolean; }
export async function dirExists  (p: string): Promise<boolean>                     { return (await fileStat(p))?.isDirectory() as boolean; }
export async function exeExists  (p: string): Promise<boolean>                     { return await fileAccess(p, fs_.constants.X_OK); }

export async function createDir(p: string, opts: fs_.MakeDirectoryOptions = { recursive: true }): Promise<string|undefined> { return fs_.promises.mkdir(p, opts); }

export async function findExe(
  exePath: string,
  opts?: {
    cwd?: string;
    env?: plat.EnvVars;
    paths?: string[];
  }
): Promise<string | undefined> {
  const cwd = opts?.cwd ?? plat.cwd();
  const env = opts?.env ?? plat.env;
  const dirs = opts?.paths ?? env['PATH']?.split(path.delimiter) ?? [];

  // Absolute path doesn't need Path reslution
  if (path.isAbsolute(exePath)) {
    return await exeExists(exePath) ? exePath : undefined;
  }

  // We have a directory and the directory is relative (see above). Make the path absolute to the current working directory
  if (path.dirname(exePath) !== '.') {
    const fullPath = path.join(cwd, exePath);
    return await exeExists(fullPath) ? fullPath : undefined;
  }

  // No PATH environment. Make path absolute to the cwd.
  if (dirs.length === 0) {
    const fullPath = path.join(cwd, exePath);
    return await exeExists(fullPath) ? fullPath : undefined;
  }

  // We have a simple file name. We get the path variable from the env and try to find the executable on the path
  const hasExt = isWhiteSpace(path.extname(exePath));
  for (const dirEntry of dirs) {
    const fullPath = path.isAbsolute(dirEntry)
      ? path.join(dirEntry, exePath)
      : path.join(cwd, dirEntry, exePath);

    if (await exeExists(fullPath)) {
      return fullPath;
    }
    if (plat.isWindows && !hasExt) {

      // No extension; append default windows exe extensions
      const pathExts = (env['PATHEXT'] ?? '.exe;.com;.cmd;.bat').split(path.delimiter);
      for (const extEntry of pathExts) {
        const fullWithExt = fullPath + extEntry;
        if (await exeExists(fullWithExt)) { return fullWithExt; }
      }
    }
  }
  return undefined;
}
