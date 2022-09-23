'use strict';
import * as types from './types';

export function coalesce<T>(array: readonly (T|null|undefined)[]): T[] {
  return array.filter(types.isDefined);
}
