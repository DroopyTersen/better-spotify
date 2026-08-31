export interface CacheManager {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type CacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class LocalStorageCache implements CacheManager {
  constructor(private readonly storage: CacheStorage = localStorage) {}

  async getItem<T>(key: string): Promise<T | null> {
    try {
      const item = this.storage.getItem(key);
      if (!item) return null;

      try {
        const parsed = JSON.parse(item);
        // Check if we have our wrapper structure
        if (parsed && typeof parsed === "object" && "value" in parsed) {
          return parsed.value as T;
        }

        console.warn("Invalid browser cache entry was cleared");
        this.removeItem(key);
        return null;
      } catch {
        console.warn("Invalid browser cache entry was cleared");
        this.removeItem(key);
        return null;
      }
    } catch {
      console.error("Browser cache could not be read");
      return null;
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      const wrapped = { value };
      this.storage.setItem(key, JSON.stringify(wrapped));
    } catch {
      console.error("Browser cache could not be written");
      try {
        this.storage.removeItem(key);
      } catch {} // Ignore cleanup errors
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      this.storage.removeItem(key);
    } catch {
      console.error("Browser cache entry could not be removed");
    }
  }
}
