'use strict';
import * as fs_ from 'fs';
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

export enum FileType {
  File         = 1,
  Directory    = 2,
  SymbolicLink = 64
}

export function fileStatSync  (p: string): fs_.Stats|undefined { return fs_.statSync(p, { throwIfNoEntry: false }); }
export function fileExistsSync(p: string): boolean             { return fileStatSync(p)?.isFile() ?? false; }
export function dirExistsSync (p: string): boolean             { return fileStatSync(p)?.isDirectory() ?? false; }

export async function fileAccess (p: string, permission: number): Promise<boolean> { return strings.isNotBlank(p) && fs_.promises.access(p, permission).then(_ => true, _ => false); }
export async function fileStat   (p: string): Promise<fs_.Stats|undefined>         { return strings.isNotBlank(p) ? await fs_.promises.stat(p).catch(_ => undefined) : undefined; }
export async function pathExists (p: string, typeMask?: FileType): Promise<boolean> {
  const stat = await fileStat(p);
  if (!stat)     { return false; }
  if (!typeMask) { return true; }
  const type: FileType =
      (stat.isFile()         ? FileType.File         : 0)
    | (stat.isDirectory()    ? FileType.Directory    : 0)
    | (stat.isSymbolicLink() ? FileType.SymbolicLink : 0);
  return (type & typeMask) === typeMask;
}
export async function fileExists (p: string): Promise<boolean> { return pathExists(p, FileType.File);      }
export async function dirExists  (p: string): Promise<boolean> { return pathExists(p, FileType.Directory); }
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
  const hasExt = strings.isNotBlank(path.extname(exePath));
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
