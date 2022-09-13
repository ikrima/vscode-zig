'use strict';

import * as fs_ from 'fs';
import { promisify } from 'util';

export { constants } from 'fs';
export const access    = promisify(fs_.access);
export const stat      = promisify(fs_.stat);
export const mkdir     = promisify(fs_.mkdir);
export const readdir   = promisify(fs_.readdir);
export const readFile  = promisify(fs_.readFile);
export const writeFile = promisify(fs_.writeFile);
export const copyFile  = promisify(fs_.copyFile);
export const unlink    = promisify(fs_.unlink);

export async function exists    (path:     string): Promise<boolean> { return access(path, fs_.constants.F_OK).then(_ => true, _ => false); }
export async function fileExists(filePath: string): Promise<boolean> { return stat  (filePath).then(v => v.isFile()     , _ => false); }
export async function dirExists (dirPath:  string): Promise<boolean> { return stat  (dirPath ).then(v => v.isDirectory(), _ => false); }
export async function createDir (dirPath:  string, opts: fs_.MakeDirectoryOptions = { recursive: true }): Promise<string|undefined> { return mkdir(dirPath, opts); }

// export async function tryStat   (filePath: PathLike): Promise<Stats|null> { return stat(filePath).catch(_ => null);         }
// export async function exists    (path:     string  ): Promise<boolean>    { return types.isDefined(await tryStat(path)); }
// export async function fileExists(filePath: string  ): Promise<boolean>    { return (await tryStat(filePath))?.isFile()     ?? false; }
// export async function dirExists (dirPath:  string  ): Promise<boolean>    { return (await tryStat(dirPath))?.isDirectory() ?? false; }
