// Credentials passed to BasecampClient constructor — sourced from Phase 1's TokenStore
export interface BasecampCredentials {
  accessToken: string;
  accountId: string; // always from TokenStore, never from user input (NFR-5.2)
}

// Thrown when a non-GET method is attempted (NFR-5.1)
export class ReadOnlyError extends Error {
  constructor(method: string) {
    super(`BasecampClient is read-only in v1. Blocked method: ${method}`);
    this.name = 'ReadOnlyError';
  }
}

// Thrown when rate limit retries are exhausted (not thrown during normal retry — only after max attempts)
export class RateLimitError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`Basecamp rate limit exceeded. Retry after ${retryAfterMs}ms`);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

// Request options for internal use
export interface BasecampRequestOptions {
  searchParams?: Record<string, string | number>;
}
