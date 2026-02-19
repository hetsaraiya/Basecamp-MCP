# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Any AI agent can access the full context of a Basecamp project on demand, so it can act intelligently on real project knowledge — not guesses.
**Current focus:** Phase 2 — API Client Infrastructure

## Current Position

Phase: 2 of 5 (API Client Infrastructure) - In Progress
Plan: 2 of 3 in phase 2 - COMPLETE
Status: Phase 2 Plan 2 Complete — Ready for Plan 3 (MCP Tools stub, if applicable)
Last activity: 2026-02-19 — Plan 02-02 complete: paginate(), htmlToMarkdown(), 6 zod schemas, 7 BasecampClient endpoint methods

Progress: [█████░░░░░] 50%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 4 min
- Total execution time: 16 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-oauth-foundation | 2 | 8 min | 4 min |
| 02-api-client-infrastructure | 2 | 8 min | 4 min |

**Recent Trend:**
- Last 5 plans: 5 min, 3 min, 4 min, 4 min
- Trend: stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Research]: TypeScript MCP SDK chosen over Python SDK (Anthropic reference implementation; more mature)
- [Research]: `got` v14 over `axios` or raw fetch (ESM-native, built-in retry)
- [Research]: SQLite over Redis for token storage (zero infrastructure; survives restarts)
- [Research]: Streamable HTTP transport required — stdio cannot host OAuth callback or per-user state
- [Research]: Phase 4 session-to-user binding needs validation against MCP SDK source before implementation
- [Phase 01-01]: better-sqlite3 ^12.0.0 used instead of ^9.0.0 — Node 24 requires v12+ for prebuilt binaries
- [Phase 01-01]: @types/simple-oauth2 added as devDependency — simple-oauth2 v5 ships no bundled .d.ts files
- [Phase 01-01]: Type assertion for authorizeURL to pass Basecamp-required type=web_server param not in @types definitions
- [Phase 01-02]: UPSERT pattern in TokenStore.save() (ON CONFLICT DO UPDATE) for idempotent re-auth flows
- [Phase 01-02]: expires_at stored as milliseconds INTEGER — direct match with Date.getTime(), no conversion layer
- [Phase 01-02]: getTokenForUser() uses 5-min REFRESH_BUFFER_MS to avoid expiry mid-request
- [Phase 01-02]: refreshMutexes exported from store.ts, managed in oauth.ts — store owns data, oauth owns lifecycle
- [Phase 02-01]: got@14 ESM default import style; all local imports use .js extension per NodeNext moduleResolution
- [Phase 02-01]: got built-in retry disabled (retry: { limit: 0 }) — withRateLimit owns all 429 retry logic, prevents double-retry
- [Phase 02-01]: unwrapHookError() added — got wraps beforeRequest hook errors in RequestError; callers must receive ReadOnlyError directly
- [Phase 02-01]: getRaw() returns full Response<unknown> for Link header access by Plan 02-02 pagination layer
- [Phase 02-02]: node-html-parser chosen over turndown/marked — handles Basecamp custom tags (bc-attachment, mention, bc-gallery) natively via tagName switch; lightweight ESM-compatible
- [Phase 02-02]: paginate<T>() transform callback pattern — schema parse inside callback keeps paginate() fully generic; field-mapping logic co-located with field-mapping table
- [Phase 02-02]: AttachmentSchema content hardcoded to '' at call site (not in schema) — eliminates any accidental binary content data path (NFR-4.4)

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 4]: `StreamableHTTPServerTransport` session-to-user binding is architectural inference, not a documented SDK pattern. Validate against MCP SDK `^1.6.x` source and published examples before designing the session map.
- [Research gap]: Exact Basecamp OAuth access token TTL not published — refresh-on-401 strategy handles this, but confirm refresh tokens do not expire on inactivity after first real OAuth flow.
- [Research gap]: Dock `type` field string values (e.g., `"Message::Board"`) — assumed from docs; confirm against live Basecamp account during Phase 2.

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed 02-02-PLAN.md — paginate(), htmlToMarkdown(), 6 content-type schemas, 7 BasecampClient endpoint methods; Phase 2 Plan 2 done; Phase 2 complete
Resume file: None
