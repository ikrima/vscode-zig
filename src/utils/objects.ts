'use strict';
import * as types from './types';

// type RecordObj = object & Record<string, unknown>;
// function isRecordObj(o: unknown): o is RecordObj { return o !== null && typeof o === 'object' && !types.isArray(o) && !types.isRegExp(o) && !types.isDate(o); }
// type Clonable = types.Primitive | Date | RegExp | unknown[] | RecordObj;
// export function deepCopy   (src: types.Primitive): typeof src;
// export function deepCopy   (src: Date           ): Date;
// export function deepCopy   (src: RegExp         ): RegExp;
// export function deepCopy   (src: Array<Clonable>): Clonable[];
// export function deepCopy<T>(src: RecordObj<T>): RecordObj<T>;
// export function deepCopy<T>(src: T              ): T;
// export function deepCopy   (src: Clonable       ): typeof src {
//   if      (types.isPrimitive(src)) { return src;                     }
//   else if (types.isDate     (src)) { return new Date(src.getTime()); }
//   else if (types.isRegExp   (src)) { return new RegExp(src);         }
//   else if (types.isArray(src)) {
//     return src.map(srcVal => isRecordObj(srcVal) ? deepCopy(srcVal) : srcVal);
//   }
//   else if (isRecordObj(src)) {
//     const result = Object.create(null) as RecordObj;
//     for (const k of Object.getOwnPropertyNames(src)) {
//       const srcPropDesc = Reflect.getOwnPropertyDescriptor(src, k)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
//       Reflect.defineProperty(result, k, srcPropDesc);
//       result[k] = deepCopy(src[k]);
//     }
//     return result;
//   }
//   else { throw new TypeError("Unable to copy obj! Its type isn't supported."); }
// }
//
// // Copies all properties of src into target and optionally overwriting pre-existing target properties
// export function mixin<T,U>(dst: T           , src: U           , overwrite: boolean): void;
// export function mixin     (dst: RecordObj, src: RecordObj, overwrite: boolean): void {
//   for (const k of Object.getOwnPropertyNames(src)) {
//     if (!(k in dst)) {
//       const srcPropDesc = Reflect.getOwnPropertyDescriptor(src, k)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
//       Reflect.defineProperty(dst, k, srcPropDesc);
//       dst[k] = deepCopy(src[k]);
//     }
//     else {
//       const srcVal    = src[k];
//       const oldDstVal = dst[k];
//       const hasSrcVal = types.isDefined(srcVal);
//       const hasDstVal = types.isDefined(oldDstVal);
//       const needsUpdate =
//            (hasSrcVal && !hasDstVal)
//         || (hasSrcVal &&  hasDstVal && overwrite);
//       if (!needsUpdate) {  continue; }
//
//       if      (types.isPrimitive(srcVal)) { dst[k] = deepCopy(srcVal);           }
//       else if (types.isDate(srcVal))      { dst[k] = deepCopy(srcVal);           }
//       else if (types.isRegExp(srcVal))    { dst[k] = deepCopy(srcVal);           }
//       else if (types.isArray(srcVal))     {
//         const dstVal = types.isArray(oldDstVal) ? oldDstVal : [];
//         dst[k] = Array.from(srcVal, (srcElm, i) => {
//           if (isRecordObj(srcElm)) {
//             const dstElm: unknown|undefined = i < dstVal.length && isRecordObj(dstVal[i]) ?  dstVal[i] : {} as RecordObj;
//             mixin(dstElm, srcElm, overwrite);
//             return dstElm;
//           }
//           else {
//             return deepCopy(srcElm);
//           }
//         });
//       }
//       else if (isRecordObj(srcVal)) {
//         const dstVal = isRecordObj(oldDstVal) ? oldDstVal : {} as RecordObj;
//         mixin(dstVal, srcVal, overwrite);
//         dst[k] = dstVal;
//       }
//       else {
//         throw new TypeError("Unable to copy obj prop! Its type isn't supported.");
//       }
//     }
//   }
// }

export function getAllPropertyKeys(obj: object): (string | symbol)[] {
  let res: (string | symbol)[] = [];
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

type RecordObj<T> = object & Record<string, unknown> & Exclude<T, readonly unknown[] | unknown[] | RegExp | Date>;
function isRecordObj<T>(o: T): o is RecordObj<T> { return o !== null && typeof o === 'object' && !types.isArray(o) && !types.isRegExp(o) && !types.isDate(o); }
export function deepCopy<T>(obj: T): T {
  if (!obj || !types.isGenericObj(obj)) { return obj; }
  if (obj instanceof RegExp) { return obj; } // See https://github.com/microsoft/TypeScript/issues/10990

  const result: any = types.isArray(obj) ? [] : {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  Object.keys(obj).forEach((k: string) => {
    const srcVal: unknown = (obj as any)[k];  // eslint-disable-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    result[k] = types.isGenericObj(srcVal) // eslint-disable-line @typescript-eslint/no-unsafe-member-access
      ? deepCopy(srcVal)
      : srcVal;
  });
  return result as T;
}

// Copies all properties of src into target and optionally overwriting pre-existing target properties
export function mixin(dst: unknown, src: unknown, overwrite: boolean): unknown {
  if (!isRecordObj(dst)) { return src; }
  if (isRecordObj(src)) {
    Object.keys(src).forEach(k => {
      if (k in dst) {
        const hasSrcVal = types.isDefined(src[k]);
        const hasDstVal = types.isDefined(dst[k]);
        const needsUpdate =
          (hasSrcVal && !hasDstVal)
          || (hasSrcVal && hasDstVal && overwrite);
        if (needsUpdate) {
          if (isRecordObj(dst[k]) && isRecordObj(src[k])) {
            mixin(dst[k], src[k], overwrite);
          } else {
            dst[k] = src[k];
          }
        }
      } else {
        dst[k] = src[k];
      }
    });
  }
  return dst;
}

//------------------------------------------------------------------------------------------------------------------------
// #region ObjectxEx
// const _hasOwnProperty = Object.prototype.hasOwnProperty; // eslint-disable-line @typescript-eslint/unbound-method
// export function equals(lhs: unknown, rhs: unknown): boolean {
//   if (lhs === rhs) { return true; }
//
//   if (types.isNullOrUndefined(lhs) || types.isNullOrUndefined(rhs)) {
//     return false;
//   }
//   else if (types.isArray(lhs) && types.isArray(rhs)) {
//     if (lhs.length !== rhs.length) { return false; }
//
//     for (let i = 0; i < lhs.length; i++) {
//       if (!equals(lhs[i], rhs[i])) {
//         return false;
//       }
//     }
//     return true;
//   }
//   else if (types.isGenericObj(lhs) && types.isGenericObj(rhs)) {
//     let key: string;
//     const oneKeys: string[] = [];
//
//     for (key in lhs) {
//       oneKeys.push(key);
//     }
//     oneKeys.sort();
//     const otherKeys: string[] = [];
//     for (key in rhs) {
//       otherKeys.push(key);
//     }
//     otherKeys.sort();
//     if (!equals(oneKeys, otherKeys)) {
//       return false;
//     }
//     let i: number;
//     for (i = 0; i < oneKeys.length; i++) {
//       if (!equals(lhs[oneKeys[i]], rhs[oneKeys[i]])) {
//         return false;
//       }
//     }
//     return true;
//   }
//   else {
//     return false;
//   }
// }
//
// export function cloneAndChange(obj: unknown, changer: (orig: unknown) => unknown): unknown {
//   return _cloneAndChange(obj, changer, new Set());
// }
//
// function _cloneAndChange(obj: unknown, changer: (orig: unknown) => unknown, seen: Set<unknown>): unknown {
//   if (types.isNullOrUndefined(obj)) { return obj; }
//
//   const changed = changer(obj);
//   if (!types.isUndefined(changed)) {
//     return changed;
//   }
//
//   if (Array.isArray(obj)) {
//     const r1: unknown[] = [];
//     for (const elem of obj) {
//       r1.push(_cloneAndChange(elem, changer, seen));
//     }
//     return r1;
//   }
//
//   if (types.isGenericObj(obj)) {
//     if (seen.has(obj)) { throw new TypeError('Cannot clone recursive data-structure'); }
//
//     seen.add(obj);
//     const r2: types.GenericObj = {};
//     for (const i2 in obj) {
//       if (_hasOwnProperty.call(obj, i2)) {
//         r2[i2] = _cloneAndChange(obj[i2], changer, seen);
//       }
//     }
//     seen.delete(obj);
//     return r2;
//   }
//
//   return obj;
// }
// #endregion
//------------------------------------------------------------------------------------------------------------------------