type SingletonGlobal = typeof globalThis & {
  __singletons?: Record<string, unknown>;
};

export function createSingleton<Value>(
  name: string,
  value: () => Value
): Value {
  const singletonGlobal = globalThis as SingletonGlobal;
  const singletons = (singletonGlobal.__singletons ??= {});
  singletons[name] ??= value();
  return singletons[name] as Value;
}
