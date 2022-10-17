'use strict';
import * as types from './types';
import { CharCode } from './charCode';

export const CrlfSep     = String.fromCharCode(CharCode.CarriageReturn, CharCode.LineFeed);
export const LineFeedSep = String.fromCharCode(CharCode.LineFeed);
export const SpaceSep    = String.fromCharCode(CharCode.Space);

export function isWhiteSpace (s: string               ): boolean     { return /^\s*$/.test(s);   }
export function isNotBlank   (s: string|undefined|null): s is string { return !!s && !isWhiteSpace(s); }
export function isLowerAscii (code: number): boolean { return code >= CharCode.a && code <= CharCode.z; }
export function isUpperAscii (code: number): boolean { return code >= CharCode.A && code <= CharCode.Z; }

const eolRegEx    = /\r\n|\r|\n/;
export function splitLines     (s: string): string[]                                   { return s.split(eolRegEx);   }
export function concatNotBlank (sep: string, items: (string|undefined|null)[]): string { return items.filter(isNotBlank).join(sep);      }

export function equals    (a: string, b: string,      ignoreCase?: boolean): boolean { return (a.length === b.length   ) && compareString(a, b, ignoreCase) === 0; }
export function startsWith(a: string, needle: string, ignoreCase?: boolean): boolean { return (needle.length > a.length) && compareString(a, needle, ignoreCase, { aEnd: needle.length }) === 0; }
export function compareString(
  a: string,
  b: string,
  ignoreCase?: boolean,
  opts?: {
    aBeg?: number;
    aEnd?: number;
    bBeg?: number;
    bEnd?: number;
  }
): number {
  if (!opts) {
    a = ignoreCase ? a.toLowerCase() : a;
    b = ignoreCase ? b.toLowerCase() : b;
    return ((a < b) ? -1 : (a > b) ? 1 : 0);
  }

  let   aIndex = opts.aBeg ?? 0;
  const aEnd   = opts.aEnd ?? a.length;
  let   bIndex = opts.bBeg ?? 0;
  const bEnd   = opts.bEnd ?? b.length;

  for (; aIndex < aEnd && bIndex < bEnd; aIndex++, bIndex++) {
    const codeA = a.charCodeAt(aIndex);
    const codeB = b.charCodeAt(bIndex);
    const isAscii = codeA < 128 && codeB < 128;

    if (codeA === codeB) {
      continue;
    }
    else if (!ignoreCase) {
      return Math.sign(codeA - codeB);
    }
    else if (ignoreCase && isAscii) {
      // map lower case ascii letter onto upper case
      const upperA = (isLowerAscii(codeA) ? codeA - 32 : codeA);
      const upperB = (isLowerAscii(codeB) ? codeB - 32 : codeB);
      return Math.sign(upperA - upperB);
    }
    else {
      // fallback to lower-casing strings
      return compareString(a.toLowerCase(), b.toLowerCase(), false, {
        aBeg: aIndex,
        aEnd: aEnd,
        bBeg: bIndex,
        bEnd: bEnd
      });
    }
  }

  const aLen = aEnd - aIndex;
  const bLen = bEnd - bIndex;
  if      (aLen < bLen) { return -1; }
  else if (aLen > bLen) { return  1; }
  else                  { return  0; }
}

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

const _fmtRegEx = /{(\d+)}/g;
export function format(value: string, ...args: unknown[]): string {
  if (args.length === 0) {
    return value;
  }
  return value.replace(_fmtRegEx, (match: string, group: string): string => {
    const idx = parseInt(group, 10);
    return (!isNaN(idx) && idx > 0 && idx < args.length)
      ? args[idx] as string
      : match;
  });
}

const _fmt2RegEx = /{([^}]+)}/g;
export function format2(template: string, values: types.GenericObj): string {
  return template.replace(_fmt2RegEx, (match: string, group: string) => {
    return (values[group] ?? match) as string;
  });
}

// Calls `JSON.Stringify` with a replacer to break apart any circular references
export function safeStringify(obj: unknown): string {
	const seen = new Set<unknown>();
	return JSON.stringify(obj, (_key, value) => {
		if (types.isGenericObj(value) || types.isArray(value)) {
			if (seen.has(value)) {
				return '[Circular]';
			} else {
				seen.add(value);
			}
		}
		return value; // eslint-disable-line @typescript-eslint/no-unsafe-return
	});
}