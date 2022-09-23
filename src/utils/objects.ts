'use strict';
import * as types from './types';


type Clonable = types.Primitive | Date | RegExp | unknown[] | types.RecordObj;
export function deepCopy   (src: types.Primitive): typeof src;
export function deepCopy   (src: Date           ): Date;
export function deepCopy   (src: RegExp         ): RegExp;
export function deepCopy   (src: Array<Clonable>): Clonable[];
export function deepCopy   (src: types.RecordObj): types.RecordObj;
export function deepCopy<T>(src: T              ): T;
export function deepCopy   (src: Clonable       ): typeof src {
  if      (types.isPrimitive(src)) { return src;                     }
  else if (types.isDate     (src)) { return new Date(src.getTime()); }
  else if (types.isRegExp   (src)) { return new RegExp(src);         }
  else if (types.isArray(src)) {
    return src.map(srcVal => types.isRecordObj(srcVal) ? deepCopy(srcVal) : srcVal);
  }
  else if (types.isRecordObj(src)) {
    const result = Object.create(null) as types.RecordObj;
    for (const k of Object.getOwnPropertyNames(src)) {
      const srcPropDesc = Reflect.getOwnPropertyDescriptor(src, k)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
      Reflect.defineProperty(result, k, srcPropDesc);
      result[k] = deepCopy(src[k]);
    }
    return result;
  }
  else { throw new TypeError("Unable to copy obj! Its type isn't supported."); }
}


// Copies all properties of src into target and optionally overwriting pre-existing target properties
export function mixin<T,U>(dst: T           , src: U           , overwrite: boolean): void;
export function mixin     (dst: types.RecordObj, src: types.RecordObj, overwrite: boolean): void {
  for (const k of Object.getOwnPropertyNames(src)) {
    if (!(k in dst)) {
      const srcPropDesc = Reflect.getOwnPropertyDescriptor(src, k)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
      Reflect.defineProperty(dst, k, srcPropDesc);
      dst[k] = deepCopy(src[k]);
    }
    else {
      const srcVal    = src[k];
      const oldDstVal = dst[k];
      const hasSrcVal = types.isDefined(srcVal);
      const hasDstVal = types.isDefined(oldDstVal);
      const needsUpdate =
           (hasSrcVal && !hasDstVal)
        || (hasSrcVal &&  hasDstVal && overwrite);
      if (!needsUpdate) {  continue; }

      if      (types.isPrimitive(srcVal)) { dst[k] = deepCopy(srcVal);           }
      else if (types.isDate(srcVal))      { dst[k] = deepCopy(srcVal);           }
      else if (types.isRegExp(srcVal))    { dst[k] = deepCopy(srcVal);           }
      else if (types.isArray(srcVal))     {
        const dstVal = types.isArray(oldDstVal) ? oldDstVal as unknown[] : [];
        dst[k] = Array.from(srcVal, (srcElm, i) => {
          if (types.isRecordObj(srcElm)) {
            const dstElm: unknown|undefined = i < dstVal.length && types.isRecordObj(dstVal[i]) ?  dstVal[i] : {} as types.RecordObj;
            mixin(dstElm, srcElm, overwrite);
            return dstElm;
          }
          else {
            return deepCopy(srcElm);
          }
        });
      }
      else if (types.isRecordObj(srcVal)) {
        const dstVal = types.isRecordObj(oldDstVal) ? oldDstVal : {} as types.RecordObj;
        mixin(dstVal, srcVal, overwrite);
        dst[k] = dstVal;
      }
      else {
        throw new TypeError("Unable to copy obj prop! Its type isn't supported.");
      }
    }
  }
}


// eslint-disable-next-line @typescript-eslint/unbound-method
const _hasOwnProperty = Object.prototype.hasOwnProperty;

export function isEmptyObject(obj: unknown): boolean {
  if (!types.isGenericObj(obj)) { return false; }
  for (const key in obj) {
    if (_hasOwnProperty.call(obj, key)) {
      return false;
    }
  }
  return true;
}

export function getAllPropertyKeys(obj: object): (string|symbol)[] {
  let res: (string|symbol)[] = [];
  let proto = Reflect.getPrototypeOf(obj);
  while (proto && proto !== Object.prototype) {
    res = res.concat(Reflect.ownKeys(proto));
    proto = Reflect.getPrototypeOf(proto);
  }
  return res;
}

export function getAllPropertyNames(obj: object): string[] {
  return getAllPropertyKeys(obj).map(k => k.toString());
}
export function getAllMethodNames(obj: object): string[] {
  return getAllPropertyNames(obj)
    .filter(k => types.isFunction(Reflect.get(obj, k)))
    .map(k => k.toString());
}
