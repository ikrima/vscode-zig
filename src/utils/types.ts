'use strict';

import { isDate, isRegExp } from 'util/types';
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

import type {
  Primitive,
  GenericObj,
  RecordObj,
} from './typesEx';

export {
  Primitive,
  GenericObj,
  RecordObj,
  Class,
  NonUndefined,
  PromiseResult,
  Complement,
  ValuesType,
  ElementType,
  ObjKeys,
  ObjValues,
  ObjPropType,
  ObjFunctionKeys,
  ObjNonFunctionKeys,
  ObjReadonlyKeys,
  ObjMutableKeys,
  ObjDeepReadOnly,
  ObjMutable,
  ObjRequired,
  ObjOptional,
  ObjIntersect,
  ObjDiff,
  ObjSubtract,
  ObjPropReplace,
  ObjPropAssign,
  RequiredKeys,
  OptionalKeys,
  PickByValue,
  PickByValueExact,
  OmitByValue,
  OmitByValueExact,
  DeepReadonly,
  DeepRequired,
  DeepNonNullable,
  DeepPartial,
} from './typesEx';

type PredFn<T> = (o: unknown) => o is T;
// type Falsy = false | '' | 0 | null | undefined;

export function isUndefined           (o: unknown): o is undefined                       { return o === undefined;                                                                     }
export function isNull                (o: unknown): o is null                            { return o === null;                                                                          }
export function isNullOrUndefined     (o: unknown): o is null|undefined                  { return o === null || o === undefined;                                                       }
export function isDefined<T>          (o: T|null|undefined): o is T                      { return o !== null && o !== undefined;                                                       }
export function isBoolean             (o: unknown): o is boolean                         { return typeof o === 'boolean';                                                              }
export function isNumber              (o: unknown): o is number                          { return typeof o === "number";                                                               }
export function isString              (o: unknown): o is string                          { return typeof o === "string";                                                               }
export function isSymbol              (o: unknown): o is symbol                          { return typeof o === 'symbol';                                                               }
export function isPrimitive           (o: unknown): o is Primitive                       { return o === null || o === undefined || (typeof o !== 'object' && typeof o !== 'function'); }
export function isArray               (o: readonly unknown[]|unknown): o is readonly unknown[];
export function isArray               (o: unknown): o is unknown[]                       { return Array.isArray(o); }
export function isArrayOf<T>          (o: unknown, fn: PredFn<T>): o is T[]              { return Array.isArray(o) && o.every(fn);                                                     }
export function isStringArray         (o: unknown): o is string[]                        { return isArrayOf(o, isString);                                                              }
export function isGenericObj          (o: unknown): o is GenericObj                      { return o !== null && typeof o === 'object';    }
export function isRecordObj           (o: unknown): o is RecordObj                       { return o !== null && typeof o === 'object' && !isArray(o) && !isRegExp(o) && !isDate(o);    }
export function isFunction            (o: unknown): o is Function                        { return typeof o === 'function';                                                             } // eslint-disable-line @typescript-eslint/ban-types

export function hasPropKey<T, K extends PropertyKey>(o: T, name: K): o is T & object & { [P in K]: unknown | undefined } {
  return o !== null && typeof o === 'object' && name in o;
}
export function hasPropOf<T, K extends PropertyKey, V>(o: T, name: K, predFn: PredFn<V>): o is T & object & { [P in K]: V } {
  return hasPropKey(o, name) && predFn(o[name]);
}
export function hasFunction<T, K extends PropertyKey>(o: T, name: K): o is T & object & { [P in K]: Function } { // eslint-disable-line @typescript-eslint/ban-types
  return hasPropKey(o, name) && isFunction(o[name]);
}

export function isIterable<T>         (o: unknown): o is Iterable<T>                     { return hasFunction(o, Symbol.iterator);                           }
export function isIterableIterator<T> (o: unknown): o is IterableIterator<T>             { return hasFunction(o, 'next') && hasFunction(o, Symbol.iterator); }
export function isThenable<T>         (o: unknown): o is Thenable<T>                     { return hasFunction(o, 'then');                                    }





export function assertNever        (_: never, msg: string = 'Unreachable'): never         { throw new Error(msg); }
export function assertType         (condition: unknown, type?: string): asserts condition { if (!condition) { throw new TypeError(type ? `Unexpected type, expected '${type}'` : 'Unexpected type'); } }
export function assertIsDefined<T=unknown> (o: T|null|undefined):               asserts o is T    { if (!isDefined(o)) { throw new TypeError('Assertion Failed: argument is undefined or null'); } }
export function assertAllDefined           (o: (unknown|null|undefined)[]):     asserts o is NonNullable<unknown>[] {
  o.every((v, i) => {
    if (!isDefined(v)) {
      throw new TypeError(`Assertion Failed: argument at index ${i} is undefined or null`);
    }
  });
}

export function nullAsUndefined<T>(x: T | null     ): T | undefined { return isNull(x)      ? undefined : x; } // Converts null to undefined, passes all other values through
export function undefinedAsNull<T>(x: T | undefined): T | null      { return isUndefined(x) ? null      : x; } // Converts undefined to null, passes all other values through
