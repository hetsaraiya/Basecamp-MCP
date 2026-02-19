# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Any AI agent can access the full context of a Basecamp project on demand, so it can act intelligently on real project knowledge — not guesses.
**Current focus:** Phase 2 — API Client Infrastructure

## Current Position

Phase: 1 of 5 (OAuth Foundation) - COMPLETE
Plan: 2 of 2 in phase 1 - COMPLETE
Status: Phase 1 Complete — Ready for Phase 2
Last activity: 2026-02-19 — Plan 01-02 complete: TokenStore, getTokenForUser(), /oauth/revoke endpoint

Progress: [██░░░░░░░░] 20%

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 4 min
- Total execution time: 8 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-oauth-foundation | 2 | 8 min | 4 min |

**Recent Trend:**
- Last 5 plans: 5 min, 3 min
- Trend: improving

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 4]: `StreamableHTTPServerTransport` session-to-user binding is architectural inference, not a documented SDK pattern. Validate against MCP SDK `^1.6.x` source and published examples before designing the session map.
- [Research gap]: Exact Basecamp OAuth access token TTL not published — refresh-on-401 strategy handles this, but confirm refresh tokens do not expire on inactivity after first real OAuth flow.
- [Research gap]: Dock `type` field string values (e.g., `"Message::Board"`) — assumed from docs; confirm against live Basecamp account during Phase 2.

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed 01-02-PLAN.md — TokenStore, getTokenForUser(), /oauth/revoke complete; Phase 1 done; Phase 2 next
Resume file: None
