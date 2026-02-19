---
phase: 02-api-client-infrastructure
plan: "01"
subsystem: api
tags: [got, http-client, rate-limit, concurrency, typescript, esm]

# Dependency graph
requires:
  - phase: 01-oauth-foundation
    provides: TokenStore providing accessToken+accountId credentials fed into BasecampClient constructor
provides:
  - BasecampClient class with get() and getRaw() methods for all Basecamp HTTP access
  - withRateLimit() wrapper handling 429 retry with Retry-After header and exponential backoff
  - computeBackoffDelay() pure function for jittered backoff (base 1s, max 30s)
  - ReadOnlyError and RateLimitError typed error classes
  - Concurrency semaphore capping 5 in-flight requests per client instance
affects: [02-02, 02-03, 03-mcp-tools, 04-session-management]

# Tech tracking
tech-stack:
  added: [got@14 (ESM-native HTTP client)]
  patterns:
    - got.extend() for per-instance configuration with prefixUrl + auth headers
    - beforeRequest hook for read-only enforcement (fires before any network activity)
    - Semaphore pattern (inFlight counter + resolve queue) for concurrency cap
    - withRateLimit wrapper separates retry logic from HTTP logic
    - unwrapHookError() extracts ReadOnlyError from got's RequestError wrapper

key-files:
  created:
    - src/client/types.ts
    - src/client/rate-limit.ts
    - src/client/BasecampClient.ts
  modified:
    - package.json (got@14 added)
    - package-lock.json

key-decisions:
  - "got@14 imported as ESM default (import got from 'got') — .js extensions on all local imports for NodeNext moduleResolution"
  - "got built-in retry disabled (retry: { limit: 0 }) — withRateLimit owns all retry logic to avoid double-retry on 429"
  - "unwrapHookError() added to get()/getRaw() — got wraps hook-thrown errors in RequestError; callers must receive ReadOnlyError directly"
  - "getRaw() returns full Response<unknown> for Link header access by Plan 02-02 pagination layer"
  - "Retry-After parsed as integer seconds first, HTTP-date second, computeBackoffDelay() fallback when absent"

patterns-established:
  - "All Basecamp HTTP access goes through BasecampClient.get() — never raw got or fetch"
  - "One BasecampClient instance per user token — constructed with credentials from TokenStore"
  - "withRateLimit wraps every got request, not just some — uniform 429 handling guaranteed"
  - "NodeNext moduleResolution: all local imports must use .js extension even for .ts source files"

requirements-completed: [NFR-1.1, NFR-1.2, NFR-1.3, NFR-5.1, NFR-5.2, NFR-5.3]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 2 Plan 01: API Client Infrastructure Summary

**got v14 BasecampClient with read-only enforcement, 5-slot concurrency semaphore, and 429 retry via Retry-After header and exponential backoff with jitter**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T05:38:19Z
- **Completed:** 2026-02-19T05:41:45Z
- **Tasks:** 3
- **Files modified:** 5 (3 created + package.json + package-lock.json)

## Accomplishments

- `src/client/types.ts` — typed error classes (`ReadOnlyError`, `RateLimitError`) and interfaces (`BasecampCredentials`, `BasecampRequestOptions`)
- `src/client/rate-limit.ts` — `withRateLimit()` with Retry-After header parsing (integer seconds + HTTP-date) and `computeBackoffDelay()` pure function
- `src/client/BasecampClient.ts` — got.extend() instance with beforeRequest read-only hook, acquire/release semaphore (max 5 concurrent), `get<T>()` and `getRaw()` public methods
- `got@14` installed as ESM-native HTTP dependency

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared types and interfaces** - `7ff833c` (feat)
2. **Task 2: Rate-limit wrapper with Retry-After and exponential backoff** - `103b3ff` (feat)
3. **Task 3: BasecampClient core — got instance, concurrent cap, read-only guard** - `05585fc` (feat)

## Files Created/Modified

- `src/client/types.ts` — `BasecampCredentials`, `ReadOnlyError`, `RateLimitError`, `BasecampRequestOptions` — no runtime dependencies
- `src/client/rate-limit.ts` — exports `computeBackoffDelay(attempt): number` and `withRateLimit<T>(fn, attempt?, maxAttempts?): Promise<T>`
- `src/client/BasecampClient.ts` — exports `BasecampClient` class with `get<T>(path, options?): Promise<T>` and `getRaw(path, options?): Promise<Response<unknown>>`
- `package.json` — got@14 added as production dependency
- `package-lock.json` — lockfile updated

## Decisions Made

- **got@14 ESM import style**: `import got from 'got'` (default import). All local cross-file imports use `.js` extension per NodeNext `moduleResolution`. This is the only correct pattern — TypeScript resolves `.js` to `.ts` at compile time.
- **Disable got's built-in retry**: `retry: { limit: 0 }` — `withRateLimit` owns all retry logic. Leaving got's default retry active would cause double-retry on 429, leading to longer waits than intended.
- **getRaw() returns `Response<unknown>`**: Plan 02-02 needs the `link` response header for cursor-based pagination. `getRaw()` follows the same acquire/release/rate-limit pattern as `get()` but returns the full Response object without calling `.json()`.
- **Retry-After parsing order**: integer seconds → HTTP-date → `computeBackoffDelay()` fallback. This matches RFC 7231 and Basecamp's actual usage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] unwrapHookError() added to surface ReadOnlyError directly to callers**
- **Found during:** Task 3 (BasecampClient verification)
- **Issue:** got v14 wraps errors thrown inside `beforeRequest` hooks in a `RequestError` with the original error stored in `error.cause`. Callers of `get()` would receive `RequestError { code: 'ERR_GOT_REQUEST_ERROR' }` instead of `ReadOnlyError`, making the error indistinguishable from a network error.
- **Fix:** Added `unwrapHookError(error: unknown): never` helper. In `get()` and `getRaw()`, any caught error is passed through `unwrapHookError` which checks if `error.cause instanceof ReadOnlyError` and re-throws the cause directly.
- **Files modified:** `src/client/BasecampClient.ts`
- **Verification:** Smoke test confirmed `err.cause instanceof ReadOnlyError` for POST via internal instance; `unwrapHookError` makes the public API throw `ReadOnlyError` directly.
- **Committed in:** `05585fc` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in error propagation)
**Impact on plan:** Fix required for correct error semantics. Plan specified callers should receive `ReadOnlyError`; without the fix they would receive an opaque `RequestError`.

## Issues Encountered

- got@14 was not in `package.json` — installed during Task 3 as documented in the plan's action. `npm install got@14` added 24 packages. No vulnerabilities found.
- Account ID `123456` in smoke test triggered a 404 (not 401) — Basecamp routes by account ID in the path; a nonexistent account returns 404. The test was adapted to accept both 401 and 404 as valid "got is firing" indicators.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `BasecampClient` is importable and fully typed. Plan 02-02 can import `BasecampClient` from `src/client/BasecampClient.js` and `BasecampCredentials` from `src/client/types.js`
- `getRaw()` signature confirmed: `getRaw(path: string, options?: BasecampRequestOptions): Promise<Response<unknown>>` — Plan 02-02's `paginate()` uses this to read the `link` response header
- TypeScript compiles zero errors across all three files
- Concurrency and rate-limit layers are transparent to callers — Plan 02-02 methods call `this.client.get()` without any retry/queue boilerplate

---
*Phase: 02-api-client-infrastructure*
*Completed: 2026-02-19*

## Self-Check: PASSED

- FOUND: src/client/types.ts
- FOUND: src/client/rate-limit.ts
- FOUND: src/client/BasecampClient.ts
- FOUND: .planning/phases/02-api-client-infrastructure/02-01-SUMMARY.md
- FOUND commit: 7ff833c (Task 1)
- FOUND commit: 103b3ff (Task 2)
- FOUND commit: 05585fc (Task 3)
