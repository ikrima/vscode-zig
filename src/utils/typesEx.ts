/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
'use strict';

//------------------------------------------------------------------------------------------------------------------------
// #region Types Constraints: Helpers

export type Primitive  = null | undefined | boolean | number | bigint | string | symbol;
export type GenericObj = object & Record<PropertyKey, unknown>;
export type RecordObj  = Record<string, unknown>;
export type Class<T>   = new (...args: any[]) => T;

/** @example  type NonUndefined<string|null|undefined> = string|null; */
export type NonUndefined<A> = A extends undefined ? never : A;

/** @example type PromiseResult<Promise<string>> = string; */
export type PromiseResult<T extends Promise<any>> = T extends Promise<infer U> ? U : never;

/** @example type Complement<'1'|'2'|'3', '2'|'3'> = "1"; */
export type Complement<A, A1 extends A> = Exclude<A, A1>;

/**
 * Get the union type of all the values in an object, array or array-like type `T`
 * @example
 *  type ValuesType<{ name: string; age: number; visible: boolean }> = string | number | boolean;
 *  type ValuesType<number[]> = number;
 *  type ValuesType<readonly symbol[]> = symbol;
 *  type ValuesType<[1, 2]> = 1 | 2;
 *  type ValuesType<readonly [1, 2]> = 1 | 2;
 *  type ValuesType<Uint8Array> = number;
 */
export type ValuesType<
  T extends ReadonlyArray<any> | ArrayLike<any> | Record<any, any>
> = T extends ReadonlyArray<any>
  ? T[number]
  : T extends ArrayLike<any>
  ? T[number]
  : T extends object
  ? T[keyof T]
  : never;

/**
* Get the type of elements inside of array, tuple or object of type `T`, that matches the given index type `K`
* @example
*  type ElementType<{ name: string; age: number; visible: boolean }, 'name'> = string;
*  type ElementType<[boolean, number], '0'> = boolean;
*  type ElementType<[boolean, number], '1'> = number;
*  type ElementType<boolean[], number> = boolean;
*  type Obj = { [key: string]: number };
*  type ElementType<Obj, string> = number;
*/
export type ElementType<
  T extends { [P in K & any]: any },
  K extends keyof T | number
> = T[K];





type IfEquals<X, Y, A = X, B = never> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
  ? A : B;


// #endregion
//------------------------------------------------------------------------------------------------------------------------

//------------------------------------------------------------------------------------------------------------------------
// #region Objects

/** @example type ObjKeys<{ name: string; age: number; visible: boolean }> = "name" | "age" | "visible"; */
export type ObjKeys<T extends object> = keyof T;

/** @example type ObjValues<{ name: string; age: number; visible: boolean }> = string | number | boolean */
export type ObjValues<T extends object> = T[keyof T];

/**
 * @example
 *  type ObjPropType<{ name: string; age: number; visible: boolean }, 'name'> = string;
 *  type ObjPropType<[boolean, number], '0'> = boolean;
 *  type ObjPropType<[boolean, number], '1'> = number;
 */
export type ObjPropType<T extends object, K extends keyof T> = T[K];

/**
 * Get union type of keys that are functions in object type `T`
 * @example
 *  type MixedProps = {name: string; setName: (name: string) => void; someKeys?: string; someFn?: (...args: any) => any;};
 *  type ObjFunctionKeys<MixedProps> = "setName | someFn";
 */
export type ObjFunctionKeys<T extends object> = {
  [K in keyof T]-?: NonUndefined<T[K]> extends Function ? K : never;
}[keyof T];

/**
 * Get union type of keys that are non-functions in object type `T`
 * @example
 *  type MixedProps = {name: string; setName: (name: string) => void; someKeys?: string; someFn?: (...args: any) => any;};
 *  type ObjNonFunctionKeys<MixedProps> = "name | someKey";
 */
export type ObjNonFunctionKeys<T extends object> = {
  [K in keyof T]-?: NonUndefined<T[K]> extends Function ? never : K;
}[keyof T];

/**
 * Get union type of keys that are readonly in object type `T`
 * [credit](https://stackoverflow.com/questions/52443276/how-to-exclude-getter-only-properties-from-type-in-typescript)
 * @example type ReadonlyKeys<{ readonly foo: string; bar: number }> = "foo";
 */
export type ObjReadonlyKeys<T extends object> = {
  [P in keyof T]-?: IfEquals<
    { [Q in P]: T[P] },
    { -readonly [Q in P]: T[P] },
    never,
    P
  >;
}[keyof T];

/**
 * Get union type of keys that are mutable in object type `T`
 * [credit](https://stackoverflow.com/questions/52443276/how-to-exclude-getter-only-properties-from-type-in-typescript)
 * @example
 *  type ObjMutableKeys<{ readonly foo: string; bar: number }> = "bar";
 */
export type ObjMutableKeys<T extends object> = {
  [P in keyof T]-?: IfEquals<
    { [Q in P]: T[P] },
    { -readonly [Q in P]: T[P] },
    P
  >;
}[keyof T];


// #endregion
//------------------------------------------------------------------------------------------------------------------------

//------------------------------------------------------------------------------------------------------------------------
// #region Obj Transformation

/** Make all nested properties as readonly */
export type ObjDeepReadOnly<T extends object> = DeepReadonly<T>;

/**
 * Make all properties in T as writable
 * @example
 *  type Props = { readonly name: string; readonly age: number; readonly visible: boolean; };
 *  type Mutable<Props> = { name: string; age: number; visible: boolean; }
 */
export type ObjMutable<T extends object> = { -readonly [P in keyof T]: T[P] };

/**
 * From `T` make a set of properties by key `K` become required
 * @example
 *  type Props = { name?: string; age?: number; visible?: boolean };
 *  type ObjRequired<Props> = { name: string; age: number; visible: boolean; }
 *  type ObjRequired<Props,'age'|'visible'> = { name?: string; age: number; visible: boolean; }
 */
export type ObjRequired<
  T extends object,
  K extends keyof T = keyof T
> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * From `T` make a set of properties by key `K` become optional
 * @example
 *  type Props = { name: string; age: number; visible: boolean; };
 *  type Optional<Props> = { name?: string; age?: number; visible?: boolean; };
 *  type Optional<Props,'age'|'visible'> = { name: string; age?: number; visible?: boolean; };
 */
export type ObjOptional<T extends object, K extends keyof T = keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * From `T` pick properties that exist in `U`
 * @example
 *  type Props = { name: string; age: number; visible: boolean };
 *  type ObjIntersect<Props, { age: number }> = { age: number; };
 */
export type ObjIntersect<T extends object, U extends object> = Pick<
  T,
  Extract<keyof T, keyof U> & Extract<keyof U, keyof T>
>;

/**
 * From `T` remove properties that exist in `U`
 * @example
 *  type Props = { name: string; age: number; visible: boolean };
 *  type DefaultProps = { age: number };
 *  type ObjDiff<Props, DefaultProps> = { name: string; visible: boolean; };
 */
export type ObjDiff<T extends object, U extends object> = Pick<
  T,
  Exclude<keyof T, keyof U>
>;

/**
 * From `T` remove properties that exist in `T1` (`T1` has a subset of the properties of `T`)
 * @example
 *  type Props = { name: string; age: number; visible: boolean };
 *  type DefaultProps = { age: number };
 *  type Subtract<Props, DefaultProps> = { name: string; visible: boolean; };
 */
export type ObjSubtract<T extends T1, T1 extends object> = Pick<
  T,
  Complement<keyof T, keyof T1>
>;

/**
 * From `U` overwrite properties to `T`
 * @example
 *  type Props = { name: string; age: number; visible: boolean };
 *  type NewProps = { age: string; other: string };
 *  type ObjPropReplace<Props, NewProps> = { name: string; age: string; visible: boolean; };
 */
export type ObjPropReplace<
  T extends object,
  U extends object,
  I = ObjDiff<T, U> & ObjIntersect<U, T>
> = Pick<I, keyof I>;

/**
* From `U` assign properties to `T` (just like object assign)
* @example
*  type Props = { name: string; age: number; visible: boolean };
*  type NewProps = { age: string; other: string };
*  type ObjPropAssign<Props, NewProps> = { name: string; age: number; visible: boolean; other: string; };
*/
export type ObjPropAssign<
  T extends object,
  U extends object,
  I = ObjDiff<T, U> & ObjIntersect<U, T> & ObjDiff<U, T>
> = Pick<I, keyof I>;

// #endregion
//------------------------------------------------------------------------------------------------------------------------

//------------------------------------------------------------------------------------------------------------------------
// #region Picking/Selection


/**
 * Get union type of keys that are required in object type `T`
 * [credit](https://stackoverflow.com/questions/52984808/is-there-a-way-to-get-all-required-properties-of-a-typescript-object)
 * @example
 *  type Props = { req: number; reqUndef: number | undefined; opt?: string; optUndef?: number | undefined; };
 *  type ObjRequiredKeys<Props> = "req" | "reqUndef";
 */
export type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

/**
 * Get union type of keys that are optional in object type `T`
 * [credit](https://stackoverflow.com/questions/52984808/is-there-a-way-to-get-all-required-properties-of-a-typescript-object)
 * @example
 *  type Props = { req: number; reqUndef: number | undefined; opt?: string; optUndef?: number | undefined; };
 *  type ObjOptionalKeys<Props> = "opt" | "optUndef";
 */
export type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];


/**
 * From `T` pick a set of properties by value matching `ValueType`
 * [credit](https://medium.com/dailyjs/typescript-create-a-condition-based-subset-types-9d902cea5b8c)
 * @example
 *  type Props = { req: number; reqUndef: number | undefined; opt?: string; };
 *  type PickByValue<Props, number> = { req: number };
 *  type PickByValue<Props, number | undefined> = { req: number; reqUndef: number | undefined; };
 */
export type PickByValue<T, ValueType> = Pick<
  T,
  { [Key in keyof T]-?: T[Key] extends ValueType ? Key : never }[keyof T]
>;

/**
* From `T` pick a set of properties by value matching exact `ValueType`.
* @example
*  type Props = { req: number; reqUndef: number | undefined; opt?: string; };
*  type PickByValueExact<Props, number> = { req: number };
*  type PickByValueExact<Props, number | undefined> = { reqUndef: number | undefined; };
*/
export type PickByValueExact<T, ValueType> = Pick<
  T,
  {
    [Key in keyof T]-?: [ValueType] extends [T[Key]]
    ? [T[Key]] extends [ValueType]
    ? Key
    : never
    : never;
  }[keyof T]
>;

/**
* From `T` remove a set of properties by value matching `ValueType`.
* [credit](https://medium.com/dailyjs/typescript-create-a-condition-based-subset-types-9d902cea5b8c)
* @example
*  type Props = { req: number; reqUndef: number | undefined; opt?: string; };
*  type OmitByValue<Props, number> = { reqUndef: number | undefined; opt?: string; };
*  type OmitByValue<Props, number | undefined> = { opt?: string; };
*/
export type OmitByValue<T, ValueType> = Pick<
  T,
  { [Key in keyof T]-?: T[Key] extends ValueType ? never : Key }[keyof T]
>;

/**
* From `T` remove a set of properties by value matching exact `ValueType`.
* @example
*  type Props = { req: number; reqUndef: number | undefined; opt?: string; };
*  type OmitByValueExact<Props, number> = { reqUndef: number | undefined; opt?: string; };
*  type OmitByValueExact<Props, number | undefined> = { req: number; opt?: string };
*/
export type OmitByValueExact<T, ValueType> = Pick<
  T,
  {
    [Key in keyof T]-?: [ValueType] extends [T[Key]]
    ? [T[Key]] extends [ValueType]
    ? never
    : Key
    : Key;
  }[keyof T]
>;

// #endregion
//------------------------------------------------------------------------------------------------------------------------


//------------------------------------------------------------------------------------------------------------------------
// #region Recursive

/**
 * Readonly that works for deeply nested structure
 * @example
 *   // Expect: {
 *   //   readonly first: {
 *   //     readonly second: {
 *   //       readonly name: string;
 *   //     };
 *   //   };
 *   // }
 *  type NestedProps = {
 *     first: {
 *       second: {
 *         name: string;
 *       };
 *     };
 *   };
 *  type ReadonlyNestedProps = DeepReadonly<NestedProps>;
 */
export type DeepReadonly<T> = T extends ((...args: any[]) => any) |
  Primitive ? T
  : T extends _DeepReadonlyArray<infer U> ? _DeepReadonlyArray<U>
  : T extends _DeepReadonlyObject<infer V> ? _DeepReadonlyObject<V>
  : T;
type _DeepReadonlyObject<T> = { readonly [P in keyof T]: DeepReadonly<T[P]>; };
type _DeepReadonlyArray<T> = ReadonlyArray<DeepReadonly<T>>;
// interface _DeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> { }

/**
 * Required that works for deeply nested structure
 * @example
 *   // Expect: {
 *   //   first: {
 *   //     second: {
 *   //       name: string;
 *   //     };
 *   //   };
 *   // }
 *  type NestedProps = {
 *     first?: {
 *       second?: {
 *         name?: string;
 *       };
 *     };
 *   };
 *  type RequiredNestedProps = DeepRequired<NestedProps>;
 */
export type DeepRequired<T> = T extends (...args: any[]) => any
  ? T
  : T extends any[]
  ? _DeepRequiredArray<T[number]>
  : T extends object
  ? _DeepRequiredObject<T>
  : T;
type _DeepRequiredObject<T> = { [P in keyof T]-?: DeepRequired<NonUndefined<T[P]>>; };
type _DeepRequiredArray<T> = Array<DeepRequired<NonUndefined<T>>>;
// interface _DeepRequiredArray<T> extends Array<DeepRequired<NonUndefined<T>>> { }


/**
 * NonNullable that works for deeply nested structure
 * @example
 *   // Expect: {
 *   //   first: {
 *   //     second: {
 *   //       name: string;
 *   //     };
 *   //   };
 *   // }
 *  type NestedProps = {
 *     first?: null | {
 *       second?: null | {
 *         name?: string | null |
 *         undefined;
 *       };
 *     };
 *   };
 *  type RequiredNestedProps = DeepNonNullable<NestedProps>;
 */
export type DeepNonNullable<T> = T extends (...args: any[]) => any
  ? T
  : T extends any[]
  ? _DeepNonNullableArray<T[number]>
  : T extends object
  ? _DeepNonNullableObject<T>
  : T;
type _DeepNonNullableObject<T> = { [P in keyof T]-?: DeepNonNullable<NonNullable<T[P]>>; };
type _DeepNonNullableArray<T> = Array<DeepNonNullable<NonNullable<T>>>;
// interface _DeepNonNullableArray<T> extends Array<DeepNonNullable<NonNullable<T>>> { }

/**
 * Partial that works for deeply nested structure
 * @example
 *   // Expect: {
 *   //   first?: {
 *   //     second?: {
 *   //       name?: string;
 *   //     };
 *   //   };
 *   // }
 *  type NestedProps = {
 *     first: {
 *       second: {
 *         name: string;
 *       };
 *     };
 *   };
 *  type PartialNestedProps = DeepPartial<NestedProps>;
 */
export type DeepPartial<T> = T extends Function
  ? T
  : T extends Array<infer U>
  ? _DeepPartialArray<U>
  : T extends object
  ? _DeepPartialObject<T>
  : T | undefined;
type _DeepPartialObject<T> = { [P in keyof T]?: DeepPartial<T[P]> };
type _DeepPartialArray<T> = Array<DeepPartial<T>>;
// interface _DeepPartialArray<T> extends Array<DeepPartial<T>> { }

// #endregion
//------------------------------------------------------------------------------------------------------------------------



//------------------------------------------------------------------------------------------------------------------------
// #region Ref Mapped

// /**
//  * @example
//  *  type SetDiff<'1'|'2'|'3', '2'|'3'|'4'> = "1";
//  *  type SetDiff<string|number|(() => void), Function> = string|number;
//  */
// type SetDiff<A, B> = Exclude<A, B>;
// /**
//  * @example
//  *  type SetIntersection<'1'|'2'|'3', '2'|'3'|'4'> = "2"|"3";
//  *  type SetIntersection<string|number|(() => void), Function> = () => void;
//  */
// type SetIntersection<A, B> = Extract<A, B>;
// /**
//  * @example type SymmetricDiff<'1'|'2'|'3', '2'|'3'|'4'> = "1"|"4";
//  */
// type SetSymmetricDiff<A, B> = Exclude<A | B, A & B>;
//
// /**
//  * Copies the shape of the type supplied, but marks every field optional.
//  * @example
//  *  type Props = { name: string; age: number; visible: boolean };
//  *  type ShapeType<Props> = { name?: string; age?: number; visible?: boolean };
//  */
// type ObjShapeType<T extends object> = Partial<T>;
//
// /**
//  * Disjoin object to form union of objects, each with single property
//  * @example
//  *  type Props = { name: string; age: number; visible: boolean };
//  *  type ToDisjointUnion<Props> = { name: string; } | { age: number; } | { visible: boolean; };
//  */
// type ToDisjointUnion<T extends object> = {
//   [P in keyof T]: { [Q in P]: T[P] };
// }[keyof T];
//
// /**
//  * Get intersection type given union type `U`
//  * [credit](https://stackoverflow.com/a/50375286/7381355)
//  * @example
//  *  type Foo = { name: string } | { age: number } | { visible: boolean };
//  *  type UnionToIntersection<Foo> = { name: string } & { age: number } & { visible: boolean };
//  */
// type UnionToIntersection<U> = (U extends any
//   ? (k: U) => void
//   : never) extends (k: infer I) => void
//   ? I
//   : never;

// #endregion
//------------------------------------------------------------------------------------------------------------------------