'use strict';
import * as path_ from 'path';
import * as fs_ from 'fs';
import * as cp_ from 'child_process';
import { promisify } from 'util';
import * as types_ from 'util/types';

export namespace types {
  export const {
    isDate,
    isRegExp,
    isNativeError,
    isBooleanObject,
    isNumberObject,
    isStringObject,
    isSymbolObject,
    isBoxedPrimitive,
    isMap,
    isSet,
    isPromise,
    isProxy,
    isAsyncFunction,
    isTypedArray,
  } = types_;

  export type Primitive = null|undefined|boolean|number|string;
  export type AnyObj    = Record<PropertyKey,unknown>;
  export function isUndefined            (o: unknown): o is undefined       { return o === undefined;                                                                        }
  export function isNull                 (o: unknown): o is null            { return o === null;                                                                             }
  export function isNullOrUndefined      (o: unknown): o is null|undefined  { return o === undefined || o === null;                                                          }
  export function isDefined<T>           (o: T | null | undefined): o is T  { return o !== undefined && o !== null;                                                          }
  export function isSymbol               (o: unknown  ): o is symbol        { return typeof o === 'symbol';                                                                  }
  export function isBoolean              (o: unknown  ): o is boolean       { return typeof o === 'boolean';                                                                 }
  export function isNumber               (o: unknown  ): o is number        { return typeof o === "number";                                                                  }
  export function isString               (o: unknown  ): o is string        { return typeof o === "string";                                                                  }
  export function isArray<T>             (o: unknown  ): o is T[]           { return Array.isArray(o);                                                                       }
  export function isObject               (o: unknown  ): o is AnyObj        { return typeof o === 'object' && o !== null && !isArray(o) && !isRegExp(o) && !isDate(o);       }
  export function isFunction             (o: unknown  ): o is Function      { return typeof o === 'function';                                                                } // eslint-disable-line @typescript-eslint/ban-types
  export function isPrimitive            (o: unknown  ): o is Primitive     { return o === null || o === undefined || (typeof o !== 'object' && typeof o !== 'function');    }
  export function isStringArray          (o: unknown  ): o is string[]      { return Array.isArray(o) && (<unknown[]>o).every(e => isString(e));                             }
  export function isFunctionArray        (o: unknown[]): o is Function[]    { return o.length > 0 && o.every(isFunction);                                                    } // eslint-disable-line @typescript-eslint/ban-types
  export function isIterable<T=unknown>  (o: unknown  ): o is Iterable<T>   { return !!o && typeof o === 'object' && isFunction((o as any)[Symbol.iterator]);                } // eslint-disable-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  export function isThenable<T>          (o: unknown  ): o is Promise<T>    { return !!o && typeof (o as Promise<T>).then === 'function';                                    }
  export function assertNever        (_: never, msg: string = 'Unreachable'): never         { throw new Error(msg); }
  export function assertType         (condition: unknown, type?: string): asserts condition { if (!condition) { throw new TypeError(type ? `Unexpected type, expected '${type}'` : 'Unexpected type'); } }
  export function assertIsDefined<T> (o: T | null | undefined):           asserts o is T    { if (!isDefined(o)) { throw new TypeError('Assertion Failed: argument is undefined or null'); } }
  export function assertAllDefined   (o: (unknown | null | undefined)[]): asserts o is NonNullable<unknown>[] {
    o.every((e, i) => {
      if (!isDefined(e)) {
        throw new TypeError(`Assertion Failed: argument at index ${i} is undefined or null`);
      }
    });
  }

  export function withNullAsUndefined<T>(x: T | null     ): T | undefined { return isNull(x)      ? undefined : x; } // Converts null to undefined, passes all other values through
  export function withUndefinedAsNull<T>(x: T | undefined): T | null      { return isUndefined(x) ? null      : x; } // Converts undefined to null, passes all other values through
}

export namespace objects {
  type Clonable = types.Primitive | Date | RegExp | unknown[] | types.AnyObj;
  // export function deepCopy(src: null           ): null;
  // export function deepCopy(src: undefined      ): undefined;
  // export function deepCopy(src: boolean        ): boolean;
  // export function deepCopy(src: number         ): number;
  // export function deepCopy(src: string         ): string;
  export function deepCopy   (src: types.Primitive): typeof src;
  export function deepCopy   (src: Date           ): Date;
  export function deepCopy   (src: RegExp         ): RegExp;
  export function deepCopy   (src: Array<Clonable>): Clonable[];
  export function deepCopy   (src: types.AnyObj   ): types.AnyObj;
  export function deepCopy<T>(src: T              ): T;
  export function deepCopy   (src: Clonable       ): typeof src {
    if      (types.isPrimitive(src)) { return src;                     }
    else if (types.isDate     (src)) { return new Date(src.getTime()); }
    else if (types.isRegExp   (src)) { return new RegExp(src);         }
    else if (types.isArray    (src)) { return src.map(deepCopy);       }
    else if (types.isObject   (src)) {
      // const srcRecord    = src as types.AnyObj;
      const result       = Object.create(null) as types.AnyObj;
      const srcPropDescs = Object.getOwnPropertyDescriptors(src);
      for (const k of Object.getOwnPropertyNames(src)) {
        // const k = key as keyof typeof src;
        Object.defineProperty(result, k, srcPropDescs[k]);
        result[k] = deepCopy(src[k]);
      }
      return result;
    }
    else { throw new TypeError("Unable to copy obj! Its type isn't supported."); }
  }

  // Copies all properties of src into target and optionally overwriting pre-existing target properties
  export function mixin<T,U>(dst: T           , src: U           , overwrite: boolean): T|U;
  export function mixin     (dst: types.AnyObj, src: types.AnyObj, overwrite: boolean): void {
    types.assertType(types.isObject(src));
    types.assertType(types.isObject(dst));

    const srcPropDescs = Object.getOwnPropertyDescriptors(src);
    for (const k of Object.getOwnPropertyNames(src)) {
      if (!(k in dst)) {
        Object.defineProperty(dst, k, srcPropDescs[k]);
        dst[k] = deepCopy(src[k]);
      }
      else {
        const hasSrcVal = types.isDefined(src[k]);
        const hasDstVal = types.isDefined(dst[k]);
        const needsUpdate =
             (hasSrcVal && !hasDstVal)
          || (hasSrcVal &&  hasDstVal && overwrite);
        if (!needsUpdate) {  continue; }

        const srcVal = src[k];
        if ( types.isPrimitive(srcVal)
          || types.isDate     (srcVal)
          || types.isRegExp   (srcVal)) { dst[k] = deepCopy(srcVal); }
        else if (types.isArray(srcVal)) {
          const dstArr = types.isArray(dst[k]) ? dst[k] as unknown[] : [];
          dst[k] = Array.from(srcVal, (srcElm, i) => {
            if (types.isObject(srcElm)) { const dstElm = i < dstArr.length ? dstArr[i] : {}; mixin(dstElm, srcElm, overwrite); return dstElm; }
            else                        { return deepCopy(srcElm); }
          });
        }
        else if (types.isObject(srcVal)) { const dstVal = types.isDefined(dst[k]) ? dst[k] : {}; mixin(dstVal, srcVal, overwrite); dst[k] = dstVal;  }
        else                             { throw new TypeError("Unable to copy obj prop! Its type isn't supported."); }
      }
    }
  }

  export function isEmptyObject(obj: unknown): boolean {
    if (!types.isObject(obj)) { return false; }
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        return false;
      }
    }
    return true;
  }

  export function getAllPropertyNames(obj: Record<string, unknown>): string[] {
    let res: string[] = [];
    let proto: unknown = Object.getPrototypeOf(obj);
    while (Object.prototype !== proto) {
      res = res.concat(Object.getOwnPropertyNames(proto));
      proto = Object.getPrototypeOf(proto);
    }
    return res;
  }
  export function getAllMethodNames(obj: Record<string, unknown>): string[] {
    const methods: string[] = [];
    for (const prop of getAllPropertyNames(obj)) {
      if (types.isFunction(obj[prop])) {
        methods.push(prop);
      }
    }
    return methods;
  }
}
export namespace path {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  export const {
    normalize,
    dirname,
    basename,
    extname,
    join,
    isAbsolute,
    resolve,
    sep,
    delimiter,
  } = path_;

  export function filename(p: string): string { return path_.parse(p).name; }
}

export namespace fs {
  export const stat      = promisify(fs_.stat);
  export const mkdir     = promisify(fs_.mkdir);
  export const readdir   = promisify(fs_.readdir);
  export const readFile  = promisify(fs_.readFile);
  export const writeFile = promisify(fs_.writeFile);
  export const exists    = promisify(fs_.exists);
  export const copyFile  = promisify(fs_.copyFile);
  export const unlink    = promisify(fs_.unlink);

  export async function tryStat   (filePath: fs_.PathLike): Promise<fs_.Stats|null> { return  await stat(filePath ).catch (_ => null);         }
  export async function fileExists(filePath: string      ): Promise<boolean>        { return (await tryStat(filePath))?.isFile()     ?? false; }
  export async function dirExists (dirPath:  string      ): Promise<boolean>        { return (await tryStat(dirPath))?.isDirectory() ?? false; }
  export async function createDir (dirPath:  string, opts: fs_.MakeDirectoryOptions = { recursive: true }): Promise<string|undefined> { return mkdir(dirPath, opts); }
}

export namespace cp {
  export const execFile = promisify(cp_.execFile);
  export const {
    exec,
    spawn,
  } = cp_;
  export type ChildProcess      = cp_.ChildProcess;
  export type ExecException     = cp_.ExecException;
  export type ExecFileException = cp_.ExecFileException;
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
}

export namespace arrays {
  export function coalesce<T>(array: ReadonlyArray<T | undefined | null>): T[] {
    return <T[]>array.filter(e => !!e);
  }
}

export namespace strings {
  export const eolRegEx   = /\r\n|\r|\n/;
  export const crlfString = "\r\n";
  export const lfString   = "\n";

  export function isWhiteSpace      (s: string           ): boolean  { return s.length === 0 || /\S/.test(s) === false;   }
  export function splitLines        (s: string           ): string[] { return s.split(eolRegEx);              }
  export function compare           (a: string, b: string): number   { return (a < b) ? -1 : (a > b) ? 1 : 0; }
  export function compareIgnoreCase (a: string, b: string): number   { return compare(a.toLowerCase(), b.toLowerCase()); }
  export function equalsIgnoreCase  (a: string, b: string): boolean  { return a.length === b.length && a.toLowerCase() === b.toLowerCase(); }
  export function nonEmptyFilter    (a: string | undefined | null): a is string { return a?.length !== 0; }
  export function filterJoin        (sep: string, items: (string | undefined | null)[]): string { return items.filter(nonEmptyFilter).join(sep); }

  export function fuzzyContains(target: string, query: string): boolean {
    // return early if target or query are undefined
    if (!target || !query) { return false; }

    // impossible for query to be contained in target
    if (target.length < query.length) { return false; }

    const queryLen = query.length;
    const targetLower = target.toLowerCase();

    let index = 0;
    let lastIndexOf = -1;
    while (index < queryLen) {
      const indexOf = targetLower.indexOf(query[index], lastIndexOf + 1);
      if (indexOf < 0) { return false; }
      lastIndexOf = indexOf;
      index++;
    }
    return true;
  }

}
