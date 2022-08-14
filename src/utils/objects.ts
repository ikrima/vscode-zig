'use strict';
import * as types from './types';


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
