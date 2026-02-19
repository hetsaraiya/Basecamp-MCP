# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Any AI agent can access the full context of a Basecamp project on demand, so it can act intelligently on real project knowledge — not guesses.
**Current focus:** Phase 1 — OAuth Foundation

## Current Position

Phase: 1 of 5 (OAuth Foundation)
Plan: 1 of 2 in current phase
Status: In Progress
Last activity: 2026-02-19 — Plan 01-01 complete: OAuth foundation scaffolded and implemented

Progress: [█░░░░░░░░░] 10%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 5 min
- Total execution time: 5 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-oauth-foundation | 1 | 5 min | 5 min |

**Recent Trend:**
- Last 5 plans: 5 min
- Trend: -

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 4]: `StreamableHTTPServerTransport` session-to-user binding is architectural inference, not a documented SDK pattern. Validate against MCP SDK `^1.6.x` source and published examples before designing the session map.
- [Research gap]: Exact Basecamp OAuth access token TTL not published — refresh-on-401 strategy handles this, but confirm refresh tokens do not expire on inactivity after first real OAuth flow.
- [Research gap]: Dock `type` field string values (e.g., `"Message::Board"`) — assumed from docs; confirm against live Basecamp account during Phase 2.

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed 01-01-PLAN.md — OAuth foundation scaffolded; Plan 01-02 (TokenStore) next
Resume file: None
