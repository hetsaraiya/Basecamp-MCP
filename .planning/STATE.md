# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Any AI agent can access the full context of a Basecamp project on demand, so it can act intelligently on real project knowledge — not guesses.
**Current focus:** Phase 3 — MCP Tool Definitions

## Current Position

Phase: 2 of 5 (API Client Infrastructure) - Complete
Plan: Phase 2 fully complete
Status: Phase 2 Complete — Ready to plan Phase 3
Last activity: 2026-02-19 — Pre-phase-3 blocker research complete; all blockers resolved; architectural decisions recorded

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
- [Research resolved 2026-02-19]: StreamableHTTPServerTransport session-to-user binding confirmed via SDK tarball inspection (v1.11.0–1.27.0). Official multi-user pattern uses `onsessioninitialized` + sessionId→transport Map. Auth flows through `req.auth` → `extra.authInfo` from v1.15.0+. Minimum SDK version: `^1.15.0`.
- [Architecture decision 2026-02-19]: Per-user auth model is unique URL path per user — `/mcp/<uuid>` — no `Authorization` header needed. UUID issued after OAuth and used as route param to look up basecampUserId. Simpler than Bearer token; no middleware needed.
- [Architecture decision 2026-02-19]: Dock lookup for Phase 3 tools uses a new `getProject(projectId)` method on BasecampClient that returns the project's dock array. Tools find the relevant dock item by `name` field, not `type`.
- [Research resolved 2026-02-19]: Basecamp OAuth access token TTL is 2 weeks (not hours). Refresh-on-401 + 5-min REFRESH_BUFFER_MS is sufficient. No changes to token store needed.
- [Research resolved 2026-02-19]: Dock field is `name` (not `type`). Correct values: `message_board`, `todoset`, `vault`, `chat`, `schedule`, `questionnaire`. Previous assumption of Ruby-style `"Message::Board"` was wrong.
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

None — all pre-phase-3 blockers resolved 2026-02-19.

## Session Continuity

Last session: 2026-02-19
Stopped at: Pre-phase-3 blocker research complete. Phase 2 done. All 3 blockers resolved. Auth model decided (unique URL per user). Dock lookup decided (getProject method). Ready to run /gsd:plan-phase 3.
Resume file: None
