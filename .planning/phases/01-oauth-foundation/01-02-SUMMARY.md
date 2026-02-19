---
phase: 01-oauth-foundation
plan: "02"
subsystem: auth
tags: [sqlite, better-sqlite3, oauth2, token-refresh, token-revocation, typescript, express]

# Dependency graph
requires:
  - phase: 01-oauth-foundation plan 01
    provides: TokenRecord interface, handleCallback() returning TokenRecord, Express server with /oauth/callback
provides:
  - TokenStore class backed by better-sqlite3 with WAL mode and upsert support
  - TokenExpiredError with code='TOKEN_EXPIRED' and reAuthUrl field
  - refreshMutexes per-user mutex Map for concurrent refresh prevention
  - tokenStore singleton for process-wide use
  - getTokenForUser() with 5-min proactive refresh buffer and per-user deduplication
  - Atomic refresh: both access_token and refresh_token updated together (Basecamp rotates refresh tokens)
  - GET /oauth/revoke?user_id=<id> endpoint calling DELETE /authorization.json then removing local record
  - /oauth/callback now persists TokenRecord to SQLite after handleCallback()
affects:
  - 02-api-client-infrastructure (calls getTokenForUser() for all Basecamp API requests)
  - All subsequent phases (token lifecycle fully managed; callers never handle refresh or expiry)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TokenStore singleton: one Database instance per process with WAL mode; synchronous better-sqlite3 avoids async complexity
    - Per-user mutex: refreshMutexes Map<number, Promise<TokenRecord>> deduplicate concurrent refresh calls for the same user
    - Atomic refresh: save() upserts both access_token and refresh_token together — Basecamp rotates refresh tokens on every refresh
    - TokenExpiredError: structured error with code='TOKEN_EXPIRED' and reAuthUrl for caller re-auth routing
    - Revocation safety: /oauth/revoke always removes local record even if Basecamp DELETE fails (network error or 401)
    - Token safety: accessToken/refreshToken never appear in HTTP responses or server logs

key-files:
  created: []
  modified:
    - src/auth/store.ts
    - src/auth/oauth.ts
    - src/server.ts

key-decisions:
  - "save() uses UPSERT (ON CONFLICT DO UPDATE) not INSERT-then-UPDATE — atomic and idempotent for re-auth flows"
  - "expires_at stored as milliseconds since epoch (INTEGER) — matches Date.getTime() directly without conversion layer"
  - "getTokenForUser() uses 5-minute proactive refresh buffer — avoids token expiry mid-request for long-running operations"
  - "refreshMutexes exported from store.ts, managed in oauth.ts — clean separation: store owns data, oauth owns lifecycle"
  - "Revoke endpoint uses query param ?user_id=<id> not path param — bookmarkable for team admin use"

patterns-established:
  - "Token lifecycle: getTokenForUser() is the single entry point for all Basecamp API token access in phases 2+"
  - "Error handling: catch TokenExpiredError by code='TOKEN_EXPIRED' and redirect to reAuthUrl for re-authentication"
  - "Concurrent safety: per-user mutex prevents thundering herd on token refresh for shared-user scenarios"

requirements-completed: [FR-1.4, FR-1.5, FR-1.6]

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 1 Plan 02: Token Store and Lifecycle Summary

**SQLite-backed TokenStore with per-user mutex refresh deduplication, 5-min proactive refresh, and GET /oauth/revoke endpoint calling Basecamp's DELETE /authorization.json**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T05:30:09Z
- **Completed:** 2026-02-19T05:32:33Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- TokenStore class with WAL-mode SQLite, upsert save(), typed get() (expiresAt as Date), and revoke() — all synchronous via better-sqlite3
- getTokenForUser() with 5-minute proactive refresh buffer and per-user mutex preventing duplicate concurrent refresh HTTP calls
- /oauth/callback now persists TokenRecord to SQLite; GET /oauth/revoke calls Basecamp DELETE then removes local row

## Task Commits

Each task was committed atomically:

1. **Task 1: SQLite token store** - `1c2424e` (feat)
2. **Task 2: Wire token store, getTokenForUser, /oauth/revoke** - `4cc4573` (feat)

## Files Created/Modified
- `src/auth/store.ts` - TokenStore class (was placeholder), TokenExpiredError, tokenStore singleton, refreshMutexes export
- `src/auth/oauth.ts` - Added getTokenForUser(), refreshTokenForUser(), re-exports TokenExpiredError from store.ts
- `src/server.ts` - /oauth/callback wires tokenStore.save(), added GET /oauth/revoke endpoint, exports getTokenForUser

## Decisions Made
- Used UPSERT pattern in save() (ON CONFLICT DO UPDATE) for idempotent re-auth flows
- Stored expires_at as milliseconds INTEGER — direct match with Date.getTime(), no conversion layer needed
- 5-minute REFRESH_BUFFER_MS chosen to accommodate typical Basecamp API call latency
- refreshMutexes lives in store.ts but is managed in oauth.ts — store owns persistence, oauth owns lifecycle logic

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0
**Impact on plan:** Plan executed as specified. All TypeScript checks pass; smoke tests confirm save/get/revoke and TokenExpiredError behavior.

## Issues Encountered
- tsx `--eval` with top-level await requires async IIFE pattern in this project — minor test script adaptation, no code impact.

## User Setup Required
None - no external service configuration required. Token lifecycle is fully in-process; live OAuth flow requires existing .env from Plan 01-01.

## Next Phase Readiness
- Phase 1 OAuth Foundation complete: any caller invokes getTokenForUser(basecampUserId) to get a valid access token without handling refresh or expiry
- Phase 2 (API Client Infrastructure) imports getTokenForUser from server.ts or oauth.ts directly
- Requires Basecamp .env credentials (set up in Plan 01-01) for end-to-end live flow testing
- SQLite DB path configurable via SQLITE_PATH env var (defaults to ./tokens.db)

---
*Phase: 01-oauth-foundation*
*Completed: 2026-02-19*

## Self-Check: PASSED

All created/modified files verified present. All task commits verified in git history.
- FOUND: src/auth/store.ts, src/auth/oauth.ts, src/server.ts, 01-02-SUMMARY.md
- FOUND commits: 1c2424e (Task 1), 4cc4573 (Task 2)
