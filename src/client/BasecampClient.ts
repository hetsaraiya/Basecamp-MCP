import got, { type Got, type Response } from 'got';
import { type BasecampCredentials, type BasecampRequestOptions, ReadOnlyError } from './types.js';
import { withRateLimit } from './rate-limit.js';

/**
 * Unwraps got's RequestError wrapper when the cause is a ReadOnlyError.
 *
 * Got wraps errors thrown in beforeRequest hooks in a RequestError with the
 * original error stored in error.cause. Callers should receive ReadOnlyError
 * directly rather than a generic RequestError with an opaque code.
 */
function unwrapHookError(error: unknown): never {
  if (
    error instanceof Error &&
    'cause' in error &&
    error.cause instanceof ReadOnlyError
  ) {
    throw error.cause;
  }
  throw error;
}

/**
 * BasecampClient — core HTTP client for the Basecamp MCP server.
 *
 * Design constraints:
 *   - Read-only: any non-GET method throws ReadOnlyError before a network request (NFR-5.1)
 *   - Per-user isolation: one instance = one accessToken (NFR-5.3)
 *   - accountId is never accepted as a method parameter (NFR-5.2)
 *   - Max 5 concurrent in-flight requests per instance (NFR-1.3)
 *   - All requests wrapped in withRateLimit for 429 handling (NFR-1.1, NFR-1.2)
 */
export class BasecampClient {
  private readonly accessToken: string;
  private readonly accountId: string;

  // got instance with prefixed URL, auth headers, and read-only hook
  private readonly instance: Got;

  // Concurrency semaphore — max 5 simultaneous requests (NFR-1.3)
  private readonly maxConcurrent = 5;
  private inFlight = 0;
  private readonly queue: Array<() => void> = [];

  constructor(credentials: BasecampCredentials) {
    this.accessToken = credentials.accessToken;
    this.accountId = credentials.accountId;

    this.instance = got.extend({
      prefixUrl: `https://3.basecampapi.com/${this.accountId}`,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'User-Agent': 'Basecamp MCP Server (contact@openxcell.com)',
        'Accept': 'application/json',
      },
      responseType: 'json',
      timeout: { request: 30_000 },
      // Disable got's built-in retry — we handle retries ourselves in withRateLimit
      retry: { limit: 0 },
      hooks: {
        beforeRequest: [
          (options) => {
            // Enforce read-only access — block any non-GET method before any network activity (NFR-5.1)
            const method = options.method.toUpperCase();
            if (method !== 'GET') {
              throw new ReadOnlyError(options.method);
            }
          },
        ],
      },
    });
  }

  // Acquire a concurrency slot (NFR-1.3)
  private async acquire(): Promise<void> {
    if (this.inFlight < this.maxConcurrent) {
      this.inFlight++;
      return;
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  // Release a concurrency slot and unblock next queued request (NFR-1.3)
  private release(): void {
    const next = this.queue.shift();
    if (next) {
      // Hand the slot directly to the next waiter (inFlight count stays the same)
      next();
    } else {
      this.inFlight--;
    }
  }

  /**
   * GET request — returns parsed JSON body as T.
   *
   * path: relative to the account prefix URL (e.g. 'projects.json')
   * options.searchParams: optional query parameters
   */
  async get<T = unknown>(path: string, options?: BasecampRequestOptions): Promise<T> {
    await this.acquire();
    try {
      return await withRateLimit(
        () => this.instance.get(path, { searchParams: options?.searchParams }).json<T>(),
      );
    } catch (error) {
      unwrapHookError(error);
    } finally {
      this.release();
    }
  }

  /**
   * getRaw — returns the full got Response object.
   *
   * Used by Plan 02-02's paginate() to access the `link` response header
   * for cursor-based pagination through Basecamp's Link headers.
   */
  async getRaw(path: string, options?: BasecampRequestOptions): Promise<Response<unknown>> {
    await this.acquire();
    try {
      return await withRateLimit(
        () => this.instance.get(path, {
          searchParams: options?.searchParams,
          responseType: 'json',
          resolveBodyOnly: false,
        }) as Promise<Response<unknown>>,
      );
    } catch (error) {
      unwrapHookError(error);
    } finally {
      this.release();
    }
  }
}
