'use strict';

import {
  normalize,
  isAbsolute,
  relative,
  join,
  resolve,
  toNamespacedPath,
  parse,
  basename,
  dirname,
  extname,
  sep,
  delimiter,
  // posix,
  // win32,
} from 'path';

export {
  sep,
  delimiter,
  isAbsolute,
  normalize,
  relative,
  join,
  resolve,
  toNamespacedPath,
  basename,
  dirname,
  extname,
};
export function filename(p: string): string { return parse(p).name; }

// export const sep              = (plat.isWindows ? win32.sep              : posix.sep              );
// export const delimiter        = (plat.isWindows ? win32.delimiter        : posix.delimiter        );
// export const normalize        = (plat.isWindows ? win32.normalize        : posix.normalize        );
// export const parse            = (plat.isWindows ? win32.parse            : posix.parse            );
// export const basename         = (plat.isWindows ? win32.basename         : posix.basename         );
// export const dirname          = (plat.isWindows ? win32.dirname          : posix.dirname          );
// export const filename         = (p: string) => parse(p).name;
// export const extname          = (plat.isWindows ? win32.extname          : posix.extname          );
// export const isAbsolute       = (plat.isWindows ? win32.isAbsolute       : posix.isAbsolute       );
// export const join             = (plat.isWindows ? win32.join             : posix.join             );
// export const resolve          = (plat.isWindows ? win32.resolve          : posix.resolve          );
// export const relative         = (plat.isWindows ? win32.relative         : posix.relative         );
// export const format           = (plat.isWindows ? win32.format           : posix.format           );
// export const toNamespacedPath = (plat.isWindows ? win32.toNamespacedPath : posix.toNamespacedPath );
