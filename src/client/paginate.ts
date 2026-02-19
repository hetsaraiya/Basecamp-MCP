/**
 * paginate.ts — Pagination envelope for Basecamp list endpoints.
 *
 * Basecamp uses RFC 5988 Link headers for cursor-based pagination.
 * This module reads the `link` response header to determine if more
 * pages exist and extracts the next page number.
 *
 * Enforces:
 *   NFR-2.1: Link header with rel="next" populates has_more and next_page
 *   NFR-2.2: Every list call returns PaginatedResult — never a raw array
 *   NFR-2.3: page param is forwarded as searchParams.page
 *   NFR-4.1: Response capped at 100 items
 *   NFR-4.2: Total serialized payload capped at 50KB
 */

export interface PaginatedResult<T> {
  items: T[];
  has_more: boolean;
  next_page: number | null;
}

/**
 * Parses an RFC 5988 Link header value and returns the URL tagged rel="next", or null.
 *
 * The header may be a single string or an array (some HTTP libraries split multi-value headers).
 * Example value: `<https://3.basecampapi.com/123/x.json?page=2>; rel="next"`
 */
function parseLinkHeader(headerValue: string | string[] | undefined): string | null {
  if (!headerValue) return null;

  const raw = Array.isArray(headerValue) ? headerValue.join(', ') : headerValue;
  const match = raw.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

/**
 * Extracts the `page` query parameter value from a URL string.
 * Returns null if not present or not a valid integer.
 */
function extractPageNumber(url: string): number | null {
  try {
    const parsed = new URL(url);
    const page = parsed.searchParams.get('page');
    if (!page) return null;
    const n = parseInt(page, 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

/**
 * paginate<T> — fetches one page from a Basecamp list endpoint and returns
 * a normalized PaginatedResult envelope.
 *
 * @param client  Object providing getRaw() — typically a BasecampClient instance
 * @param path    Relative path to the Basecamp list endpoint (e.g. 'projects.json')
 * @param page    Page number to fetch (default 1) — forwarded as searchParams.page (NFR-2.3)
 * @param transform  Function converting one raw Basecamp item to the typed result T
 */
export async function paginate<T>(
  client: {
    getRaw(
      path: string,
      opts?: { searchParams?: Record<string, string | number> },
    ): Promise<import('got').Response<unknown>>;
  },
  path: string,
  page = 1,
  transform: (raw: unknown) => T,
): Promise<PaginatedResult<T>> {
  const response = await client.getRaw(path, { searchParams: { page } });

  // Basecamp list endpoints always return arrays
  const rawArray = response.body as unknown[];

  // NFR-4.1: Cap at 100 items — items beyond 100 are dropped and has_more is forced true
  let sizeDropped = false;
  const capped = rawArray.slice(0, 100);
  if (rawArray.length > 100) {
    sizeDropped = true;
  }

  // Transform items — schema parse happens inside each transform callback
  let items = capped.map(transform);

  // NFR-4.2: 50KB payload cap — drop items from the end until serialized size is under 50KB
  const PAYLOAD_LIMIT = 51_200; // 50KB in bytes
  let payloadDropped = false;

  if (Buffer.byteLength(JSON.stringify(items), 'utf8') > PAYLOAD_LIMIT) {
    // Pop items from the end until we fit. Binary-search-style: start from worst case.
    while (items.length > 0) {
      if (Buffer.byteLength(JSON.stringify(items), 'utf8') <= PAYLOAD_LIMIT) break;
      items = items.slice(0, items.length - 1);
      payloadDropped = true;
    }
  }

  // NFR-2.1: Parse Link header for rel="next"
  const linkHeader = response.headers['link'] as string | string[] | undefined;
  const nextUrl = parseLinkHeader(linkHeader);
  const next_page = nextUrl ? extractPageNumber(nextUrl) : null;

  // NFR-2.2: has_more is true if Link header indicated more pages OR items were dropped for limits
  const has_more = nextUrl !== null || sizeDropped || payloadDropped;

  return { items, has_more, next_page };
}
