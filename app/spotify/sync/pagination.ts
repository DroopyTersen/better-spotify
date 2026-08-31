export type OffsetPage<Item> = {
  items: Item[];
  limit: number;
  next: string | null;
  offset: number;
  total: number;
};

type CollectOffsetPagesOptions<Item> = {
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
 * Loads a complete, bounded offset-paginated snapshot before callers mutate
 * the local read model. Unexpected offsets and stalled pages fail closed so a
 * partial provider response cannot replace a valid cached snapshot.
 */
export async function collectOffsetPages<Item>({
  fetchPage,
  maxItems,
  pageSize = 50,
}: CollectOffsetPagesOptions<Item>): Promise<Item[]> {
  if (!Number.isSafeInteger(maxItems) || maxItems < 1) {
    throw new RangeError("maxItems must be a positive safe integer");
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new RangeError("pageSize must be between 1 and 50");
  }

  const items: Item[] = [];
  const maxRequests = Math.ceil(maxItems / pageSize) + 1;
  await processOffsetPages({
    fetchPage: async (limit, offset) => {
      const page = await fetchPage(limit, offset);
      if (page.total > maxItems) {
        throw new RangeError(
          `Spotify pagination exceeded the ${maxItems}-item safety limit`
        );
      }
      return page;
    },
    maxRequests,
    pageSize,
    processPage: (pageItems) => {
      items.push(...pageItems);
    },
  });
  return items;
}
