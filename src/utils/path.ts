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

// export const sep              = (cp.isWindows ? win32.sep              : posix.sep                                     ); // eslint-disable-line @typescript-eslint/unbound-method
// export const delimiter        = (cp.isWindows ? win32.delimiter        : posix.delimiter                               ); // eslint-disable-line @typescript-eslint/unbound-method
// export const normalize        = (cp.isWindows ? win32.normalize        : posix.normalize                               ); // eslint-disable-line @typescript-eslint/unbound-method
// export const parse            = (cp.isWindows ? win32.parse            : posix.parse                                   ); // eslint-disable-line @typescript-eslint/unbound-method
// export const basename         = (cp.isWindows ? win32.basename         : posix.basename                                ); // eslint-disable-line @typescript-eslint/unbound-method
// export const dirname          = (cp.isWindows ? win32.dirname          : posix.dirname                                 ); // eslint-disable-line @typescript-eslint/unbound-method
// export const filename         = (p: string) => parse(p).name;
// export const extname          = (cp.isWindows ? win32.extname          : posix.extname                                 ); // eslint-disable-line @typescript-eslint/unbound-method
// export const isAbsolute       = (cp.isWindows ? win32.isAbsolute       : posix.isAbsolute                              ); // eslint-disable-line @typescript-eslint/unbound-method
// export const join             = (cp.isWindows ? win32.join             : posix.join                                    ); // eslint-disable-line @typescript-eslint/unbound-method
// export const resolve          = (cp.isWindows ? win32.resolve          : posix.resolve                                 ); // eslint-disable-line @typescript-eslint/unbound-method
// export const relative         = (cp.isWindows ? win32.relative         : posix.relative                                ); // eslint-disable-line @typescript-eslint/unbound-method
// export const format           = (cp.isWindows ? win32.format           : posix.format                                  ); // eslint-disable-line @typescript-eslint/unbound-method
// export const toNamespacedPath = (cp.isWindows ? win32.toNamespacedPath : posix.toNamespacedPath                        ); // eslint-disable-line @typescript-eslint/unbound-method
