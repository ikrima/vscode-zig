'use strict';

import { isDate, isRegExp, } from 'util/types';
export {
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
} from 'util/types';

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
