---
phase: 01-oauth-foundation
plan: "01"
subsystem: auth
tags: [oauth2, express, simple-oauth2, typescript, esm, nodejs]

# Dependency graph
requires: []
provides:
  - Express server entry point with /oauth/start, /oauth/callback, /health routes
  - startAuthFlow() returning Basecamp Launchpad authorization URL with type=web_server param
  - handleCallback() exchanging authorization code for tokens and resolving bc3 account_id via authorization.json
  - TokenRecord interface (accessToken, refreshToken, expiresAt, accountId, basecampUserId, email)
  - TypeScript ESM project scaffold (package.json, tsconfig.json NodeNext)
affects:
  - 01-oauth-foundation plan 02 (TokenStore wires into handleCallback result)
  - 02-api-client-infrastructure (uses TokenRecord for API auth headers)
  - All subsequent phases (OAuth is the authentication foundation)

# Tech tracking
tech-stack:
  added:
    - express ^4.21.0 (HTTP server)
    - simple-oauth2 ^5.0.0 (OAuth 2.0 Authorization Code flow)
    - better-sqlite3 ^12.0.0 (SQLite — upgraded from ^9.0.0 for Node 24 compatibility)
    - tsx ^4.0.0 (TypeScript dev runner with watch mode)
    - typescript ^5.7.0
    - "@types/express ^5.0.0"
    - "@types/better-sqlite3 ^7.6.0"
    - "@types/node ^22.0.0"
    - "@types/simple-oauth2 ^5.0.8 (added as blocking fix — not in original plan)"
  patterns:
    - NodeNext ESM modules — all internal imports use .js extension
    - import.meta.url guard to prevent double-start when server.ts is imported
    - handleCallback returns TokenRecord but does not store — storage is TokenStore's responsibility
    - type=web_server passed as Basecamp-required extension to OAuth authorizeURL

key-files:
  created:
    - package.json
    - tsconfig.json
    - .env.example
    - .gitignore
    - src/server.ts
    - src/auth/oauth.ts
    - src/auth/store.ts
  modified: []

key-decisions:
  - "better-sqlite3 ^12.0.0 instead of ^9.0.0 — Node 24 requires v12+ for prebuilt binaries and C++20 compatibility"
  - "@types/simple-oauth2 added as devDependency — library does not ship its own .d.ts files"
  - "type assertion for authorizeURL params — Basecamp requires type=web_server which @types/simple-oauth2 omits from AuthorizationParamsLocation"
  - "handleCallback does not call TokenStore.save() — that is Plan 01-02 responsibility"

patterns-established:
  - "NodeNext ESM: all intra-project imports must use .js extension even for .ts source files"
  - "import.meta.url server guard: if (process.argv[1] === new URL(import.meta.url).pathname) prevents double-start"
  - "Token safety: never log or return accessToken/refreshToken in HTTP responses"
  - "bc3 account selection: first bc3 account used for v1; multi-account out of scope per PROJECT.md"

requirements-completed: [FR-1.1, FR-1.2, FR-1.3]

# Metrics
duration: 5min
completed: 2026-02-19
---

# Phase 1 Plan 01: OAuth Foundation Summary

**Basecamp OAuth 2.0 Authorization Code flow via simple-oauth2, resolving bc3 account_id from authorization.json, with Express server scaffolded on TypeScript NodeNext ESM**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-19T05:21:41Z
- **Completed:** 2026-02-19T05:26:54Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Complete TypeScript ESM project scaffold with package.json (type=module), tsconfig.json (NodeNext), .env.example, and .gitignore
- Express server with /oauth/start (redirects to Basecamp Launchpad with type=web_server), /oauth/callback (exchanges code, fetches identity, returns user info), and /health
- handleCallback() exchanges authorization code for tokens via simple-oauth2, then fetches GET launchpad.37signals.com/authorization.json to resolve bc3 account_id — returns complete TokenRecord with all 6 fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Project scaffolding** - `c950c09` (chore)
2. **Task 2: OAuth flow** - `44db691` (feat)

## Files Created/Modified
- `package.json` - ESM project manifest with express, simple-oauth2, better-sqlite3 dependencies
- `tsconfig.json` - TypeScript config targeting NodeNext ESM, strict mode, Node.js 22
- `.env.example` - Documents PORT, BASECAMP_CLIENT_ID, BASECAMP_CLIENT_SECRET, BASECAMP_REDIRECT_URI, SQLITE_PATH
- `.gitignore` - Excludes node_modules, dist, .env, *.db
- `src/server.ts` - Express app with /oauth/start, /oauth/callback, /health; exports app and startServer()
- `src/auth/oauth.ts` - startAuthFlow(), handleCallback(), TokenRecord interface
- `src/auth/store.ts` - Empty placeholder (implemented in Plan 01-02)

## Decisions Made
- Used better-sqlite3 ^12.0.0 instead of plan-specified ^9.0.0 — Node 24 requires v12+ for prebuilt binaries and C++20 ABI compatibility
- Added @types/simple-oauth2 as devDependency — required for TypeScript compilation since simple-oauth2 v5 ships no bundled declarations
- Type assertion for authorizeURL params to pass Basecamp-required `type=web_server` extension not in @types definitions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated better-sqlite3 from ^9.0.0 to ^12.0.0 for Node 24 compatibility**
- **Found during:** Task 1 (npm install)
- **Issue:** better-sqlite3 ^9.0.0 has no prebuilt binaries for Node 24 and native compilation fails with C++20 requirement error
- **Fix:** Updated package.json dependency to ^12.0.0 which has prebuilt binaries for Node 24
- **Files modified:** package.json, package-lock.json
- **Verification:** npm install exits 0, better-sqlite3 loads successfully
- **Committed in:** c950c09 (Task 1 commit)

**2. [Rule 3 - Blocking] Installed missing @types/simple-oauth2 devDependency**
- **Found during:** Task 2 (npx tsc --noEmit)
- **Issue:** simple-oauth2 ^5.x does not ship bundled TypeScript declarations; TS7016 error on import
- **Fix:** npm install --save-dev @types/simple-oauth2
- **Files modified:** package.json, package-lock.json
- **Verification:** npx tsc --noEmit exits 0
- **Committed in:** 44db691 (Task 2 commit)

**3. [Rule 1 - Bug] Type assertion for Basecamp-specific type=web_server OAuth param**
- **Found during:** Task 2 (npx tsc --noEmit)
- **Issue:** @types/simple-oauth2 AuthorizationParamsLocation does not include `type` field; TS2353 error
- **Fix:** Cast authorizeURL params as `unknown as Parameters<typeof client.authorizeURL>[0]` to allow extra params
- **Files modified:** src/auth/oauth.ts
- **Verification:** npx tsc --noEmit exits 0; /oauth/start redirects with type=web_server in URL
- **Committed in:** 44db691 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 type bug)
**Impact on plan:** All auto-fixes were necessary for compilation and runtime correctness. No scope creep — same libraries, same patterns, same architecture.

## Issues Encountered
- Node 24 environment (plan targets Node >=22) caused native addon compilation failure for better-sqlite3 v9. Resolved by upgrading to v12 which has Node 24 prebuilt binaries.

## User Setup Required

**External services require manual configuration before the OAuth flow can be tested end-to-end:**

1. Register a Basecamp application at https://launchpad.37signals.com → Integrations → Register an app
   - Set Redirect URI to: `http://localhost:3000/oauth/callback`
   - Product: Basecamp 3

2. Copy `.env.example` to `.env` and fill in:
   ```
   BASECAMP_CLIENT_ID=<from Launchpad>
   BASECAMP_CLIENT_SECRET=<from Launchpad>
   BASECAMP_REDIRECT_URI=http://localhost:3000/oauth/callback
   ```

3. Run `npm run dev` and visit http://localhost:3000/oauth/start to complete the OAuth flow

## Next Phase Readiness
- OAuth foundation complete: server starts, /oauth/start redirects correctly with type=web_server, handleCallback() is implemented and TypeScript-verified
- Plan 01-02 can wire TokenStore.save() into the /oauth/callback handler
- Requires user to create .env with real Basecamp credentials before end-to-end flow testing

---
*Phase: 01-oauth-foundation*
*Completed: 2026-02-19*

## Self-Check: PASSED

All created files verified present. All task commits verified in git history.
- FOUND: package.json, tsconfig.json, .env.example, .gitignore, src/server.ts, src/auth/oauth.ts, src/auth/store.ts, SUMMARY.md
- FOUND commits: c950c09 (Task 1), 44db691 (Task 2)
