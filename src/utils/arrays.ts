'use strict';

export function coalesce<T>(array: ReadonlyArray<T | undefined | null>): T[] {
  return <T[]>array.filter(e => !!e);
}
