import { useEffect, useState } from "react";
const checkIsBrowser = () => typeof window !== "undefined";

const isomorphicStorage: Partial<Storage> = {
  setItem: (key: string, value: string) => {
    return checkIsBrowser() ? localStorage.setItem(key, value) : value;
  },
  getItem: (key: string) =>
    checkIsBrowser() ? localStorage.getItem(key) : null,
};

export const getIsomorphicStorage = () => {
  return {
    setItem: (key: string, value: string) => {
      return checkIsBrowser() ? localStorage.setItem(key, value) : value;
    },
    getItem: (key: string) =>
      checkIsBrowser() ? localStorage.getItem(key) : null,
  };
};
export default function usePersistedState<T>(
  defaultValue: T,
  key: string,
  storage = isomorphicStorage
) {
  let [value, setValue] = useState<T>(() => {
    return tryGetCachedValue(key, storage, defaultValue);
  });

  useEffect(() => {
    setValue(tryGetCachedValue(key, storage, defaultValue));
  }, [key]);

  useEffect(() => {
    if (!key) return;
    let valueStr = typeof value === "string" ? value : JSON.stringify(value);
    storage?.setItem?.(key, valueStr);
  }, [key, value]);

  return [value, setValue] as [T, typeof setValue];
}

const tryGetCachedValue = (
  key: string,
  storage: Partial<Storage>,
  defaultValue: any
) => {
  try {
    let cachedValue = key ? storage?.getItem?.(key) : null;
    if (!cachedValue) return defaultValue;
    try {
      return JSON.parse(cachedValue);
    } catch (err) {
      // Unable to parse the JSON, must be a string?
      return cachedValue;
    }
  } catch (err) {
    return defaultValue;
  }
};
