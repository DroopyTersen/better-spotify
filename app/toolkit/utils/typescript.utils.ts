/**
 * Prettify:
 * A type that retains the structure and types of the input type `InputType`.
 * Essentially, it's a pass-through that ensures all keys and associated types
 * of the original type are kept intact.
 */
export type Prettify<InputType> = {
  [Key in keyof InputType]: InputType[Key];
} & {};

/**
 * IfNever:
 * A conditional type that checks if the provided type `TypeToCheck` is `never`.
 * If `TypeToCheck` is of type `never`, it defaults to the type defined in `FallbackType`.
 * Otherwise, it simply returns `TypeToCheck`.
 *
 * Example:
 * IfNever<Parameters<typeof preTemplates.format>[0], {}>
 */
export type IfNever<TypeToCheck, FallbackType> = [TypeToCheck] extends [never]
  ? FallbackType
  : TypeToCheck;

/**
 * SafeIntersection:
 * A type utility for merging two types (`FirstType` and `SecondType`).
 * If type `FirstType` is `never`, it returns type `SecondType`.
 * If type `SecondType` is `never`, it returns type `FirstType`.
 * If neither is `never`, it intersects both `FirstType` & `SecondType` types.
 *
 * Example:
 * type CombinedInput = SafeIntersection<PrePromptInput, PostPromptInput>;
 */
export type SafeIntersection<FirstType, SecondType> = [FirstType] extends [
  never,
]
  ? SecondType
  : [SecondType] extends [never]
  ? FirstType
  : FirstType & SecondType;

export type WithoutUndefined<T> = Exclude<T, undefined>;

export type AsyncReturnType<T extends (...args: any) => any> = WithoutUndefined<
  Prettify<Awaited<ReturnType<T>>>
>;

type NullableKeys<T> = {
  [K in keyof T]: Extract<T[K], null> extends never ? never : K;
}[keyof T];

export type MakeNullablePropertiesOptional<T> = Partial<
  Pick<T, NullableKeys<T>>
> &
  Omit<T, NullableKeys<T>>;

/**
 * OneOf:
 * A utility type that ensures that exactly one property from the provided type `ObjectType` is provided.
 * This is useful when you have a set of properties where at least one must be provided, but not more than one.
 *
 * @template ObjectWithAllProperties - The type that contains the properties to choose from.
 * @template SinglePropertyTypes - A mapped type that creates a new type for each property in `ObjectType`,
 *                                 where each new type only includes one property from `ObjectType`.
 *                                 By default, it is a mapped type that picks one property from `ObjectType` for each key in `ObjectType`.
 *
 * @returns - A union of all the single-property types created from `ObjectType`.
 *            This means that an object of this type must have exactly one property from `ObjectType`.
 *
 * @example
 * ```
 * type AnimalSounds = {
 *   dog?: 'bark',
 *   cat?: 'meow',
 *   cow?: 'moo'
 * };
 *
 * let sound: OneOf<AnimalSounds>;
 *
 * // This is valid because 'dog' is one of the properties of AnimalSounds.
 * sound = { dog: 'bark' };
 *
 * // This is invalid because more than one property is provided.
 * sound = { dog: 'bark', cat: 'meow' };
 * ```
 */
export type OneOf<
  ObjectWithAllProperties,
  SinglePropertyTypes = {
    [Key in keyof ObjectWithAllProperties]: Pick<ObjectWithAllProperties, Key>;
  },
> = Prettify<SinglePropertyTypes[keyof SinglePropertyTypes]>;

export type LooseAutocomplete<T extends string> = T | Omit<string, T>;
