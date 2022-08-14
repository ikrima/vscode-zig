'use strict';

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
