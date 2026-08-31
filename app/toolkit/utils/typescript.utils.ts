/**
 * Prettify:
 * A type that retains the structure and types of the input type `InputType`.
 * Essentially, it's a pass-through that ensures all keys and associated types
 * of the original type are kept intact.
 */
export type Prettify<InputType> = {
  [Key in keyof InputType]: InputType[Key];
} & {};

type WithoutUndefined<T> = Exclude<T, undefined>;

export type AsyncReturnType<
  T extends (...args: never[]) => unknown,
> = WithoutUndefined<
  Prettify<Awaited<ReturnType<T>>>
>;

export type LooseAutocomplete<T extends string> = T | Omit<string, T>;
