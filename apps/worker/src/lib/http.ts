export const USER_AGENT =
  "egx-app/0.1 (market data ingestion; +https://github.com/ahmed-lotfy-dev/egx-app)";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type RetryOptions = {
  retries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
};

/**
 * Fetch with a timeout, exponential backoff on 429/5xx, and Retry-After
 * support. 4xx responses other than 429 are returned to the caller so provider
 * adapters can handle auth refresh or missing symbols themselves.
 */
export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  options: RetryOptions = {},
): Promise<Response> {
  const { retries = 3, timeoutMs = 30_000, baseDelayMs = 500 } = options;
  const headers = new Headers(init.headers);

  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", USER_AGENT);
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        headers,
        signal: controller.signal,
      });

      if (response.status === 429 || response.status >= 500) {
        if (attempt === retries) {
          return response;
        }

        const retryAfter = Number(response.headers.get("retry-after"));
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : baseDelayMs * 2 ** attempt + Math.random() * 250;

        await sleep(Math.min(delay, 30_000));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt === retries) {
        break;
      }

      await sleep(baseDelayMs * 2 ** attempt + Math.random() * 250);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Request failed after retries");
}
