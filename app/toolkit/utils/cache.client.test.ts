import { expect, test } from "bun:test";
import { LocalStorageCache } from "./cache.client";

test("browser cache failures do not log account keys or raw storage errors", async () => {
  const accountKey = "playlist-builder:account-secret";
  const rawError = "raw-storage-secret";
  const messages: string[] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => {
    messages.push(values.map(String).join(" "));
  };

  try {
    const cache = new LocalStorageCache({
      getItem() {
        throw new Error(rawError);
      },
      setItem() {
        throw new Error(rawError);
      },
      removeItem() {
        throw new Error(rawError);
      },
    });

    expect(await cache.getItem(accountKey)).toBeNull();
    await cache.setItem(accountKey, { selected: true });
    await cache.removeItem(accountKey);
  } finally {
    console.error = originalError;
  }

  expect(messages).toEqual([
    "Browser cache could not be read",
    "Browser cache could not be written",
    "Browser cache entry could not be removed",
  ]);
  expect(messages.join(" ")).not.toContain(accountKey);
  expect(messages.join(" ")).not.toContain(rawError);
});
