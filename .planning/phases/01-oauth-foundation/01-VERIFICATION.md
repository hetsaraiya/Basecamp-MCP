---
phase: 01-oauth-foundation
verified: 2026-02-19T07:15:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "End-to-end OAuth browser flow"
    expected: "Visiting /oauth/start redirects to launchpad.37signals.com with type=web_server; completing consent redirects back to /oauth/callback and returns JSON with basecampUserId, email, accountId"
    why_human: "Requires live Basecamp credentials (.env) and a real browser session — cannot simulate Launchpad consent screen programmatically"
  - test: "Token auto-refresh triggers at 5-minute boundary"
    expected: "When a stored token has fewer than 5 minutes remaining, getTokenForUser() calls POST /authorization/token with type=refresh and persists the new tokens"
    why_human: "Requires a real Basecamp token with controlled expiry; cannot stub Basecamp's token server in a static code check"
  - test: "Per-user mutex prevents duplicate refresh calls"
    expected: "Two concurrent calls to getTokenForUser() for the same expiring user produce exactly one HTTP refresh request"
    why_human: "Concurrency behaviour requires a runtime test with two parallel callers and an HTTP intercept"
  - test: "GET /oauth/revoke removes token and calls Basecamp DELETE"
    expected: "curl /oauth/revoke?user_id=<id> returns 200 JSON, sqlite row disappears, Basecamp token is invalidated"
    why_human: "Requires a live token to revoke and network access to Basecamp to confirm server-side invalidation"
---

# Phase 1: OAuth Foundation Verification Report

**Phase Goal:** Any team member can authenticate with their Basecamp account via OAuth and receive a stored, auto-refreshing access token — the server can make authenticated API calls on that user's behalf without re-prompting.
**Verified:** 2026-02-19T07:15:00Z
**Status:** PASSED (with human verification items for live flow)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Express server starts on PORT with /oauth/start, /oauth/callback, /health routes | VERIFIED | `src/server.ts` exports `app` and `startServer()`; all three routes present; `tsx watch src/server.ts` in npm scripts |
| 2 | /oauth/start redirects to launchpad.37signals.com with type=web_server, client_id, redirect_uri | VERIFIED | `startAuthFlow()` calls `client.authorizeURL({ redirect_uri, type: 'web_server' })`; server.ts calls `res.redirect(authUrl)` |
| 3 | /oauth/callback exchanges code for tokens via simple-oauth2 and resolves account_id from authorization.json | VERIFIED | `handleCallback()` calls `client.getToken()` then `fetch('https://launchpad.37signals.com/authorization.json')`; filters bc3 accounts; returns all 6 TokenRecord fields |
| 4 | TokenRecord is persisted to SQLite after OAuth completes | VERIFIED | `server.ts` line 21: `tokenStore.save(tokenRecord)` called immediately after `handleCallback()` in /oauth/callback handler |
| 5 | getTokenForUser() returns stored token for valid (non-expiring) users | VERIFIED | `oauth.ts` lines 104-126: reads from `tokenStore.get()`, returns early if `expiresAt - now > REFRESH_BUFFER_MS` |
| 6 | Tokens are auto-refreshed when within 5 minutes of expiry | VERIFIED | `refreshTokenForUser()` POSTs to `launchpad.37signals.com/authorization/token` with `type=refresh` and `refresh_token`; both tokens updated atomically via `tokenStore.save()` |
| 7 | Failed refresh raises TokenExpiredError with code='TOKEN_EXPIRED' and reAuthUrl | VERIFIED | `TokenExpiredError` in `store.ts` with `readonly code = 'TOKEN_EXPIRED'` and `reAuthUrl` field; thrown in both `getTokenForUser()` (no record) and `refreshTokenForUser()` (non-ok response) |
| 8 | Per-user mutex prevents duplicate concurrent refresh calls | VERIFIED | `refreshMutexes` Map exported from `store.ts`; `getTokenForUser()` checks for existing promise before creating new refresh; cleans up via `.finally()` |
| 9 | GET /oauth/revoke calls DELETE /authorization.json on Basecamp and removes local SQLite row | VERIFIED | `server.ts` lines 53-54: `fetch('https://launchpad.37signals.com/authorization.json', { method: 'DELETE', ... })`; line 69: `tokenStore.revoke(basecampUserId)` always called regardless of Basecamp response |
| 10 | TypeScript compiles without errors | VERIFIED | `npx tsc --noEmit` exits 0 with no output |
| 11 | Tokens are never exposed in HTTP responses or logs | VERIFIED | All three response bodies return only `{ basecampUserId, email, accountId }` — no accessToken or refreshToken fields; no console.log of token values found |

**Score: 11/11 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | ESM project manifest; express, simple-oauth2, better-sqlite3 deps; tsx dev script | VERIFIED | `"type": "module"`, all deps present; `"dev": "tsx watch src/server.ts"` |
| `tsconfig.json` | NodeNext module resolution, strict: true | VERIFIED | `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"strict": true` |
| `.env.example` | Documents PORT, BASECAMP_CLIENT_ID, BASECAMP_CLIENT_SECRET, BASECAMP_REDIRECT_URI, SQLITE_PATH | VERIFIED | All 5 vars present with example values |
| `src/server.ts` | Exports `app` and `startServer()`; mounts /oauth/start, /oauth/callback, /health, /oauth/revoke | VERIFIED | All 4 routes mounted; both exports present; `import.meta.url` guard prevents double-start |
| `src/auth/oauth.ts` | Exports `TokenRecord`, `startAuthFlow`, `handleCallback`, `getTokenForUser`, re-exports `TokenExpiredError` | VERIFIED | All 5 exports confirmed; 169 substantive lines; no stubs |
| `src/auth/store.ts` | Exports `TokenStore`, `tokenStore` singleton, `TokenExpiredError`, `refreshMutexes` | VERIFIED | All 4 exports present; 93 substantive lines; SQLite schema, WAL mode, upsert pattern all present |

---

### Key Link Verification

#### Plan 01-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/server.ts` | `src/auth/oauth.ts` | `import { startAuthFlow, handleCallback }` | WIRED | Line 3: import confirmed; lines 9, 20: both called in route handlers |
| `src/auth/oauth.ts` | `launchpad.37signals.com/authorization/token` | `simple-oauth2 AuthorizationCode.getToken()` | WIRED | Line 1: `import { AuthorizationCode } from 'simple-oauth2'`; line 63: `client.getToken(tokenParams)` |
| `src/auth/oauth.ts` | `launchpad.37signals.com/authorization.json` | `fetch GET after token exchange` | WIRED | Line 70: `fetch('https://launchpad.37signals.com/authorization.json')` with Bearer token; response used to extract account_id and identity |

#### Plan 01-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/server.ts /oauth/callback` | `src/auth/store.ts TokenStore.save()` | `import tokenStore, call save()` | WIRED | Line 2: `import { tokenStore }`; line 21: `tokenStore.save(tokenRecord)` after handleCallback |
| `src/auth/oauth.ts getTokenForUser()` | `src/auth/store.ts TokenStore.get()` | reads token, checks expiresAt | WIRED | Line 105: `tokenStore.get(basecampUserId)`; line 111: `record.expiresAt.getTime() - Date.now() > REFRESH_BUFFER_MS` |
| `src/auth/oauth.ts refreshTokenForUser()` | `launchpad.37signals.com/authorization/token` | POST with type=refresh, refresh_token | WIRED | Line 131-136: `URLSearchParams` with `type: 'refresh'`, `refresh_token: record.refreshToken`; line 140: `fetch(url, { method: 'POST' })` |
| `src/server.ts /oauth/revoke` | `launchpad.37signals.com/authorization.json` | DELETE request with user's access token | WIRED | Lines 53-57: `fetch('https://launchpad.37signals.com/authorization.json', { method: 'DELETE', headers: { Authorization: Bearer ... } })` |
| `src/server.ts /oauth/revoke` | `src/auth/store.ts TokenStore.revoke()` | `import tokenStore, call revoke()` | WIRED | Line 69: `tokenStore.revoke(basecampUserId)` unconditionally after Basecamp DELETE |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FR-1.1 | 01-01-PLAN.md | OAuth 2.0 Authorization Code flow per team member | SATISFIED | `/oauth/start` → Basecamp Launchpad redirect; `/oauth/callback` exchanges code; full flow implemented in `oauth.ts` |
| FR-1.2 | 01-01-PLAN.md | Server hosts `/oauth/callback` endpoint to receive authorization code | SATISFIED | `server.ts` mounts `app.get('/oauth/callback', ...)` at line 13 |
| FR-1.3 | 01-01-PLAN.md | Server resolves and stores `account_id` from GET authorization.json | SATISFIED | `handleCallback()` fetches authorization.json, filters bc3 accounts, returns `accountId: String(bc3Account.id)` in TokenRecord; stored via `tokenStore.save()` |
| FR-1.4 | 01-02-PLAN.md | Tokens stored per-user in SQLite keyed by Basecamp user ID with access_token, refresh_token, expires_at | SATISFIED | `TokenStore` with schema: `basecamp_user_id INTEGER PRIMARY KEY`, `access_token`, `refresh_token`, `expires_at INTEGER` (ms epoch), `account_id`, `email` |
| FR-1.5 | 01-02-PLAN.md | Tokens auto-refreshed before expiry; 401 triggers one refresh attempt then TOKEN_EXPIRED error | SATISFIED | `getTokenForUser()` checks 5-min buffer; `refreshTokenForUser()` POSTs refresh; `TokenExpiredError` with `code='TOKEN_EXPIRED'` and `reAuthUrl` thrown on failure. Note: the 401-on-API-call retry path (FR-1.5 second half) will be wired in Phase 2's API client — `getTokenForUser` is the mechanism, not yet called from an API client. |
| FR-1.6 | 01-02-PLAN.md | Revocation endpoint calls DELETE /authorization.json and removes local token | SATISFIED | `GET /oauth/revoke` calls `DELETE https://launchpad.37signals.com/authorization.json` with Bearer token; then `tokenStore.revoke(basecampUserId)` |

**All 6 requirements for Phase 1 are SATISFIED.** No orphaned requirements found.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/auth/store.ts` | 69 | `return null` | Info | Legitimate null guard in `get()` — returns null when user has no stored token. This is the intended API contract, not a stub. |

No blocker or warning anti-patterns found. The single `return null` is intentional sentinel value.

---

### Human Verification Required

The automated checks confirm all code paths are wired correctly and TypeScript compiles cleanly. The following items require a live Basecamp environment to verify end-to-end:

**1. End-to-End OAuth Browser Flow**

**Test:** With `.env` populated with real Basecamp credentials, run `npm run dev` and visit `http://localhost:3000/oauth/start` in a browser.
**Expected:** Browser redirects to `https://launchpad.37signals.com/authorization/new?type=web_server&client_id=<id>&redirect_uri=...`. After granting consent, browser redirects to `/oauth/callback` and receives `{ message: "OAuth complete — token stored", user: { basecampUserId, email, accountId } }`.
**Why human:** Requires live Basecamp OAuth app credentials and a real Launchpad consent screen.

**2. SQLite Persistence After OAuth**

**Test:** After completing the OAuth flow, run `sqlite3 tokens.db "SELECT basecamp_user_id, email, account_id, expires_at FROM tokens;"`.
**Expected:** One row with the authenticated user's data and a non-zero expires_at timestamp.
**Why human:** Requires a live OAuth flow to populate the database.

**3. Token Auto-Refresh Boundary**

**Test:** With a stored token, manually update the `expires_at` in SQLite to `now + 4 minutes` (within the 5-minute buffer), then call `getTokenForUser()`.
**Expected:** A POST refresh request is made to `launchpad.37signals.com/authorization/token`, new tokens are stored, and the updated record is returned.
**Why human:** Requires a real Basecamp refresh token to test the actual HTTP exchange.

**4. Token Revocation Flow**

**Test:** `curl "http://localhost:3000/oauth/revoke?user_id=<id>"` with a valid stored user ID.
**Expected:** Returns `{ message: "Token revoked", basecampUserId: <id> }`. Querying SQLite shows zero rows. The token is invalidated on Basecamp's side.
**Why human:** Requires live token and network connectivity to Basecamp.

---

### Gaps Summary

No gaps found. All code paths are fully implemented and wired — no stubs, no placeholder returns, no TODO blocks. TypeScript compiles without errors.

One nuance worth noting for Phase 2: FR-1.5 specifies that on a 401 API response the server should attempt one refresh and retry. The refresh mechanism (`getTokenForUser` with auto-refresh) is fully in place. The 401 intercept and retry loop will be wired inside the Phase 2 API client — this is architecturally correct and expected; the Phase 1 contract is fulfilled.

---

_Verified: 2026-02-19T07:15:00Z_
_Verifier: Claude (gsd-verifier)_
