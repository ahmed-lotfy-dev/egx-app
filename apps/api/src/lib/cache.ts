/**
 * Tiny in-memory TTL cache for hot read endpoints.
 *
 * The API shares a small VPS with the ingest worker, so a burst of app
 * polling (instruments + overview + watchlists every 60s per client) can
 * queue dozens of identical queries behind each other. Caching the
 * read-heavy payloads for a few seconds keeps the app responsive without
 * serving stale data that matters — quotes are refreshed by the worker on
 * its own cadence anyway.
 *
 * Concurrent requests for the same key share one in-flight promise, so a
 * cold cache is filled once instead of N times.
 */

type Entry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/** Default freshness window for market reads. */
export const READ_TTL_MS = 30_000;

/**
 * Returns the cached value for `key`, loading it with `loader` when the
 * entry is missing or expired.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key);

  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }

  const pending = inFlight.get(key);

  if (pending) {
    return pending as Promise<T>;
  }

  const promise = loader()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);

  return promise;
}

/** Drops every cached entry whose key starts with `prefix`. */
export function invalidateCache(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}
