// Get the global object regardless of environment
const getGlobalThis = (): any =>
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
    ? window
    : typeof global !== "undefined"
    ? global
    : self;

export function createSingleton<Value>(
  name: string,
  value: () => Value
): Value {
  const globalObj = getGlobalThis();
  globalObj.__singletons ??= {};
  globalObj.__singletons[name] ??= value();
  return globalObj.__singletons[name];
}
