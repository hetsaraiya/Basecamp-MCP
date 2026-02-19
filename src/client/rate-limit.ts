import { RateLimitError } from './types.js';

// Internal helper: sleep for a given number of milliseconds
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Internal helper: type-narrowing check for got's HTTPError shape
function isHTTPError(error: unknown): error is { response: { statusCode: number; headers: Record<string, string | string[] | undefined> } } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as Record<string, unknown>).response === 'object' &&
    (error as Record<string, unknown>).response !== null &&
    'statusCode' in ((error as Record<string, unknown>).response as object)
  );
}

// Internal helper: parse Retry-After header into milliseconds
// Retry-After can be:
//   - a decimal integer (seconds to wait)
//   - an HTTP-date string (absolute datetime)
// Returns null if the header is absent or unparseable.
function parseRetryAfter(value: string | string[] | undefined): number | null {
  if (value === undefined || value === null) return null;
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) return null;

  // Try integer seconds first
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.floor(seconds * 1000));
  }

  // Try HTTP-date
  const ts = new Date(header).getTime();
  if (!Number.isNaN(ts)) {
    return Math.max(0, ts - Date.now());
  }

  return null;
}

/**
 * computeBackoffDelay — pure function returning exponential backoff with jitter (NFR-1.2)
 * attempt=0 → ~1–2 s, attempt=1 → ~2–3 s, attempt=2 → ~4–5 s, capped at 30 s
 */
export function computeBackoffDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 30_000);
}

/**
 * withRateLimit — wraps an async function with 429-aware retry logic (NFR-1.1)
 *
 * On 429: reads Retry-After header, waits, then retries.
 * When Retry-After is absent: falls back to computeBackoffDelay (NFR-1.2).
 * After maxAttempts retries: throws RateLimitError.
 * All other errors are re-thrown immediately without retry.
 */
export async function withRateLimit<T>(
  fn: () => Promise<T>,
  attempt = 0,
  maxAttempts = 4,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isHTTPError(error) && error.response.statusCode === 429) {
      if (attempt >= maxAttempts) {
        const finalWait = computeBackoffDelay(attempt);
        throw new RateLimitError(finalWait);
      }
      const retryAfter = error.response.headers['retry-after'];
      const waitMs = parseRetryAfter(retryAfter) ?? computeBackoffDelay(attempt);
      await sleep(waitMs);
      return withRateLimit(fn, attempt + 1, maxAttempts);
    }
    throw error;
  }
}
