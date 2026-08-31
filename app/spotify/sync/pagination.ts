export type OffsetPage<Item> = {
  items: Item[];
  limit: number;
  next: string | null;
  offset: number;
  total: number;
};

type CollectOffsetPrefixOptions<Item> = {
  fetchPage: (limit: number, offset: number) => Promise<OffsetPage<Item>>;
  maxItems: number;
  pageSize?: number;
};

type ProcessOffsetPagesOptions<Item> = {
  fetchPage: (limit: number, offset: number) => Promise<OffsetPage<Item>>;
  maxRequests: number;
  processPage: (items: readonly Item[]) => Promise<void> | void;
  pageSize?: number;
};

export type ProcessedOffsetPages = Readonly<{
  items: number;
  requests: number;
}>;

/**
 * Validates and processes an offset-paginated snapshot one page at a time.
 * The request ceiling is an operational circuit breaker, while stable totals,
 * exact offsets, and monotonic progress prevent malformed provider responses
 * from stalling or silently publishing an incomplete snapshot.
 */
export async function processOffsetPages<Item>({
  fetchPage,
  maxRequests,
  processPage,
  pageSize = 50,
}: ProcessOffsetPagesOptions<Item>): Promise<ProcessedOffsetPages> {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) {
    throw new RangeError("maxRequests must be a positive safe integer");
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new RangeError("pageSize must be between 1 and 50");
  }

  let offset = 0;
  let expectedTotal: number | null = null;

  for (let requestCount = 0; requestCount < maxRequests; requestCount += 1) {
    const page = await fetchPage(pageSize, offset);
    if (page.offset !== offset) {
      throw new Error("Spotify pagination returned an unexpected offset");
    }
    if (!Number.isSafeInteger(page.total) || page.total < 0) {
      throw new Error("Spotify pagination returned an invalid total");
    }
    expectedTotal ??= page.total;
    if (page.total !== expectedTotal) {
      throw new Error("Spotify pagination total changed during synchronization");
    }
    if (page.total > maxRequests * pageSize) {
      throw new RangeError(
        `Spotify pagination exceeded the ${maxRequests}-request safety limit`
      );
    }

    const rawItemCount = page.items.length;
    if (rawItemCount > pageSize) {
      throw new Error("Spotify pagination returned more items than requested");
    }
    const nextOffset = offset + rawItemCount;
    if (nextOffset > page.total) {
      throw new Error("Spotify pagination exceeded its reported total");
    }

    if (!page.next && nextOffset < page.total) {
      throw new Error("Spotify pagination ended before the snapshot was complete");
    }
    if (page.next && (rawItemCount === 0 || nextOffset <= offset)) {
      throw new Error("Spotify pagination stalled before completion");
    }

    await processPage(page.items);
    if (!page.next) {
      return { items: nextOffset, requests: requestCount + 1 };
    }
    offset = nextOffset;
  }

  throw new RangeError(
    `Spotify pagination exceeded the ${maxRequests}-request safety limit`
  );
}

/**
 * Loads a bounded prefix from an offset-paginated ranking. The provider may
 * report more results than the caller needs; reaching maxItems is therefore a
 * successful, intentional truncation. Before that bound, malformed, changing,
 * incomplete, and stalled pages still fail closed.
 */
export async function collectOffsetPrefix<Item>({
  fetchPage,
  maxItems,
  pageSize = 50,
}: CollectOffsetPrefixOptions<Item>): Promise<Item[]> {
  if (!Number.isSafeInteger(maxItems) || maxItems < 1) {
    throw new RangeError("maxItems must be a positive safe integer");
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new RangeError("pageSize must be between 1 and 50");
  }

  const items: Item[] = [];
  const maxRequests = Math.ceil(maxItems / pageSize) + 1;
  let offset = 0;
  let expectedTotal: number | null = null;

  for (let requestCount = 0; requestCount < maxRequests; requestCount += 1) {
    const remaining = maxItems - items.length;
    if (remaining <= 0) return items;

    const requestedLimit = Math.min(pageSize, remaining);
    const page = await fetchPage(requestedLimit, offset);
    if (page.offset !== offset) {
      throw new Error("Spotify pagination returned an unexpected offset");
    }
    if (!Number.isSafeInteger(page.total) || page.total < 0) {
      throw new Error("Spotify pagination returned an invalid total");
    }
    expectedTotal ??= page.total;
    if (page.total !== expectedTotal) {
      throw new Error("Spotify pagination total changed during synchronization");
    }

    const rawItemCount = page.items.length;
    if (rawItemCount > requestedLimit) {
      throw new Error("Spotify pagination returned more items than requested");
    }
    const nextOffset = offset + rawItemCount;
    if (nextOffset > page.total) {
      throw new Error("Spotify pagination exceeded its reported total");
    }

    items.push(...page.items);
    if (items.length >= maxItems) return items;

    if (!page.next) {
      const requiredPrefixSize = Math.min(page.total, maxItems);
      if (nextOffset < requiredPrefixSize) {
        throw new Error(
          "Spotify pagination ended before the snapshot was complete"
        );
      }
      return items;
    }
    if (rawItemCount === 0 || nextOffset <= offset) {
      throw new Error("Spotify pagination stalled before completion");
    }
    offset = nextOffset;
  }

  throw new RangeError(
    `Spotify pagination exceeded the ${maxRequests}-request safety limit`
  );
}
