'use strict';
import * as fs_ from 'fs';
import * as vsc from 'vscode';
import { CharCode } from './charCode';
import * as path from './path';
import * as plat from './plat';
import * as strings from './strings';

export { constants } from 'fs';
export {
  mkdir,
  readdir,
  readFile,
  writeFile,
  copyFile,
  unlink,
} from 'fs/promises';

export function fileExistsSync(p: string): boolean { return fs_.statSync(p, { throwIfNoEntry: false })?.isFile() as boolean; }
export function dirExistsSync (p: string): boolean { return fs_.statSync(p, { throwIfNoEntry: false })?.isDirectory() as boolean; }

export async function fileAccess (p: string, permission: number): Promise<boolean> { return strings.isNotEmpty(p) && fs_.promises.access(p, permission).then(_ => true, _ => false); }
export async function fileStat   (p: string): Promise<fs_.Stats|undefined>         { return strings.isNotEmpty(p) ? await fs_.promises.stat(p).catch(_ => undefined) : undefined; }
export async function pathExists (p: string, typeMask?: vsc.FileType.File | vsc.FileType.Directory | vsc.FileType.SymbolicLink): Promise<boolean> {
  const stat = await fileStat(p);
  if (!stat) { return false; }
  const type: vsc.FileType =
      (stat.isFile()         ? vsc.FileType.File         : 0)
    | (stat.isDirectory()    ? vsc.FileType.Directory    : 0)
    | (stat.isSymbolicLink() ? vsc.FileType.SymbolicLink : 0);
  return !typeMask || !!(type & typeMask);
}
export async function fileExists (p: string): Promise<boolean> { return pathExists(p, vsc.FileType.File);      }
export async function dirExists  (p: string): Promise<boolean> { return pathExists(p, vsc.FileType.Directory); }
export async function exeExists  (p: string): Promise<boolean> { return (await fileExists(p)) && (await fileAccess(p, fs_.constants.X_OK)); }

export async function createDir(p: string, opts: fs_.MakeDirectoryOptions = { recursive: true }): Promise<string|undefined> { return fs_.promises.mkdir(p, opts); }

export async function findExe(
  exePath: string,
  opts?: {
    cwd?: string;
    env?: plat.EnvVars;
    paths?: string[];
  }
): Promise<string | undefined> {
  const cwd      = opts?.cwd ?? plat.cwd();
  const env      = opts?.env ?? plat.env;
  const envPaths = opts?.paths ?? env['PATH']?.split(path.delimiter) ?? [];

  // Absolute path doesn't need Path reslution
  if (path.isAbsolute(exePath)) {
    return await exeExists(exePath) ? exePath : undefined;
  }

  // We have a directory and the directory is relative (see above). Make the path absolute to the current working directory
  const exeDir = path.dirname(exePath);
  if (exeDir.length >= 1 && exeDir.charCodeAt(0) === CharCode.Period) {
    const fullPath = path.join(cwd, exePath);
    return await exeExists(fullPath) ? fullPath : undefined;
  }

  // We have a simple file name. We get the path variable from the env and try to find the executable on the path
  const hasExt = strings.isNotEmpty(path.extname(exePath));
  for (const dirEntry of [cwd, ...envPaths]) {
    const fullPath = path.isAbsolute(dirEntry)
      ? path.join(dirEntry, exePath)
      : path.join(cwd, dirEntry, exePath);

    if (await exeExists(fullPath)) {
      return fullPath;
    }

    // No extension; append default windows exe extensions
    if (plat.isWindows && hasExt) {
      const pathExts = (env['PATHEXT'] ?? '.exe;.com;.cmd;.bat').split(path.delimiter);
      for (const extEntry of pathExts) {
        const fullWithExt = fullPath + extEntry;
        if (await exeExists(fullWithExt)) { return fullWithExt; }
      }
    }
  }
  return undefined;
}
