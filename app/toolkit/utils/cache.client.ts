export interface CacheManager {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class LocalStorageCache implements CacheManager {
  async getItem<T>(key: string): Promise<T | null> {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;

      try {
        const parsed = JSON.parse(item);
        // Check if we have our wrapper structure
        if (parsed && typeof parsed === "object" && "value" in parsed) {
          return parsed.value as T;
        }

        console.warn(
          `Cache value for ${key} is missing expected structure, clearing invalid cache`
        );
        this.removeItem(key);
        return null;
      } catch (parseError) {
        console.warn(
          `Failed to parse cached value for ${key}, clearing invalid cache`,
          parseError
        );
        this.removeItem(key);
        return null;
      }
    } catch (err) {
      console.error(`Failed to access localStorage for key: ${key}`, err);
      return null;
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      const wrapped = { value };
      localStorage.setItem(key, JSON.stringify(wrapped));
    } catch (err) {
      console.error(`Failed to set item in cache: ${key}`, err);
      try {
        localStorage.removeItem(key);
      } catch {} // Ignore cleanup errors
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.error(`Failed to remove item from cache: ${key}`, err);
    }
  }
}
