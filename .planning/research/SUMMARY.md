# Project Research Summary

**Project:** Basecamp MCP
**Domain:** MCP Server / API Integration / Developer Tooling
**Researched:** 2026-02-19
**Confidence:** HIGH

## Executive Summary

The Basecamp MCP is a read-only Model Context Protocol server that exposes Basecamp 3 project content — messages, to-dos, docs, campfire chat, and file attachments — as structured on-demand tools consumable by AI agents such as Claude Desktop and Cursor. The defining architectural constraint is multi-user OAuth: each OpenXcell team member authenticates with their own Basecamp account, meaning the server must centralize per-user token storage rather than treating credentials as a single server-side env var. This mandates Streamable HTTP transport (not stdio), an Express HTTP server to host the OAuth callback, and a SQLite token store keyed by Basecamp user ID. The TypeScript MCP SDK is the correct choice as Anthropic's reference implementation.

The recommended build order follows a strict dependency chain: OAuth layer first (nothing works without authenticated API access), then API client with rate-limit handling and pagination (required before any tool is stable), then MCP tool definitions, then transport wiring, then hardening. This order is not optional — it is dictated by the dependency graph of the system. Attempting to build tools before the API client's rate-limit and pagination infrastructure is in place produces a server that breaks silently on real data.

The top risks are (1) inadequate per-user token architecture causing permission bleed across users, (2) missing rate-limit backoff causing unpredictable 429 failures during multi-step agent tasks, and (3) raw HTML being returned to agents — wasting context and degrading reasoning quality. All three must be resolved before any tool ships. Write operations, webhooks, semantic search, and multi-account support are explicitly deferred to v2.

---

## Key Findings

### Confirmed Stack

The TypeScript MCP SDK is the Anthropic reference implementation and the correct choice for any serious MCP server. The Python SDK is less mature and has fewer production examples. Node.js 22 LTS is current stable.

**Core technologies:**
- `@modelcontextprotocol/sdk` ^1.6.x — MCP tool definitions and Streamable HTTP transport; reference implementation
- `got` v14 — Basecamp API HTTP client; ESM-native with built-in retry, chosen over `axios` (CommonJS-first) and raw `fetch` (no retry)
- `zod` ^3.24 — tool input schema validation; effectively required by the MCP SDK for typed tool parameters
- `simple-oauth2` ^5.x — Basecamp OAuth 2.0 Authorization Code flow; lighter than passport.js for a single provider
- `express` 4.21 — hosts OAuth callback endpoint (`/oauth/callback`) and MCP HTTP endpoint (`/mcp`)
- `better-sqlite3` ^9.x — per-user token storage (access + refresh token, keyed by Basecamp user ID); zero infrastructure, survives restarts
- `vitest` ^2.1 — ESM-native test runner, Jest-compatible API

**What was ruled out and why:**
- Redis: unnecessary infrastructure for a team tool; SQLite handles it
- Personal Access Tokens: Basecamp 3 does not support PATs for third-party apps — excluded permanently
- stdio transport: cannot handle per-user token state or host an OAuth callback; HTTP is required

See `.planning/research/STACK.md` for full rationale.

### Tool Inventory

11 MCP tools across 4 layers. The API endpoint each tool calls is listed.

| Tool | Basecamp 3 Endpoint | Purpose |
|------|---------------------|---------|
| `list_projects` | `GET /projects.json` | Root node — all subsequent tools need a `project_id` |
| `get_project_tools` | Parsed from `dock[]` in project response | Resolves `message_board_id`, `todoset_id`, `vault_id`, `chat_id` per project |
| `list_messages` | `GET /buckets/{id}/message_boards/{mb_id}/messages.json` | Message board threads |
| `get_message` | `GET /buckets/{id}/messages/{msg_id}.json` | Full message detail |
| `list_todolists` | `GET /buckets/{id}/todosets/{todoset_id}/todolists.json` | To-do list index |
| `list_todos` | `GET /buckets/{id}/todolists/{list_id}/todos.json` | Tasks with `?completed` filter |
| `get_todo` | `GET /buckets/{id}/todos/{todo_id}.json` | Full task with comments |
| `list_documents` | `GET /buckets/{id}/vaults/{vault_id}/documents.json` | Document index (truncated content) |
| `get_document` | `GET /buckets/{id}/documents/{doc_id}.json` | Full document body (markdown) |
| `list_campfire_lines` | `GET /buckets/{id}/chats/{chat_id}/lines.json` | Chat messages with `since`/`limit` bounds |
| `list_attachments` | `GET /buckets/{id}/vaults/{vault_id}/attachments.json` | File metadata only — no binary content |

**Tool input patterns:**
- All list tools: `project_id` (required) + `page?: number`
- `list_todos`: adds `completed?: boolean`
- `list_campfire_lines`: adds `since?: string` + `limit?: number` (bounded — default 24h)
- `list_projects`: adds `status?: "active" | "archived" | "all"`
- `account_id` is always internal — never surfaced in tool schemas

See `.planning/research/FEATURES.md` for full API coverage map and dependency graph.

### Architecture Approach

The server is organized into four components with clean boundaries. No component crosses into another's responsibility.

**Major components:**
1. **Transport + Session Layer** (`src/server.ts`) — Express HTTP server; hosts `POST/GET/DELETE /mcp` (MCP endpoint), `GET /oauth/start`, `GET /oauth/callback`; validates bearer token per session; maps session IDs to Basecamp user IDs
2. **OAuth Layer** (`src/auth/`) — owns the entire Basecamp Authorization Code flow; `startAuthFlow()`, `handleCallback()`, `getTokenForUser()` with auto-refresh; `TokenStore` backed by SQLite; per-user mutex to prevent duplicate refresh races
3. **API Client Layer** (`src/basecamp/`) — `BasecampClient` instantiated per-call with user's token; all 6 content types; `paginate()` following `Link` headers; `withRateLimit()` respecting `Retry-After`; HTML-to-markdown conversion; response normalization
4. **MCP Tool Layer** (`src/mcp/`) — zod input schemas + handlers; translates `tools/call` arguments to API Client calls; formats responses as MCP content envelopes

**Data flow (steady state):**
Agent POST /mcp → Transport resolves userId from session → Tool handler calls OAuth layer for token → API Client fetches from Basecamp → Tool layer formats and returns MCP response.

**Transport decision: Streamable HTTP.** Stdio cannot host an OAuth callback or hold per-user state. HTTP is not optional for multi-user OAuth.

See `.planning/research/ARCHITECTURE.md` for full data flow diagrams and token storage tier table.

### Critical Pitfalls

17 pitfalls identified across 6 domains. The 5 non-negotiables that must be solved before any tool is exposed to agents:

1. **Per-user token store with refresh support** — Without this, all tool calls run as one user (permission bleed) and break the next day when tokens expire. Store both `access_token` and `refresh_token` in SQLite keyed by `user_id`. On 401, refresh once then surface structured `TOKEN_EXPIRED` error with re-auth URL.

2. **Rate-limit-aware HTTP client with backoff** — Basecamp enforces 50 req/10s per token. Any multi-step agent task (list → detail × N) will burst through this. Respect `Retry-After` header on 429; apply exponential backoff with jitter; cap concurrent requests per token.

3. **Pagination handling on all list endpoints** — Basecamp paginates at 15 items via `Link: <url>; rel="next"` headers. Without this, an agent sees only page 1 and silently misses data. All list tools must parse `Link` headers and return `{ items, has_more, next_page }` envelopes.

4. **HTML-to-markdown conversion pipeline** — All rich-text content in Basecamp (messages, docs, to-do descriptions) is HTML. Raw HTML wastes LLM context window and degrades reasoning. Convert server-side in the API Client Layer before any tool returns content. Handle Basecamp-specific tags: `<bc-attachment>` → `[Attachment: filename]`, `<mention>` → `[@Name]`.

5. **Response size limits** — Projects with thousands of todos or large docs produce responses that overwhelm agent context windows. Hard limit: 100 items or 50KB per tool call. Document list returns truncated content with `truncated: true`; use `get_document(doc_id)` for full body. Attachment tools return metadata only — never binary content.

**Additional pitfalls to carry into each phase:**
- Campfire must enforce time bounds (`since` or `limit`) — high message volume, no unbounded queries
- Normalized response schemas defined before implementation (not raw Basecamp JSON)
- Tool count capped at 10–15 — no granular variants; use parameters not separate tools
- `account_id` resolved from OAuth and stored — never hardcoded
- Token revocation endpoint before production deployment

---

## Implications for Roadmap

Research points to a 5-phase build order, each phase being a prerequisite for the next. This ordering is not stylistic — it is dictated by the dependency graph.

### Phase 1: OAuth Foundation

**Rationale:** Nothing in this system works without authenticated access to the Basecamp API. The OAuth layer is the foundation all other components depend on. Building anything else first creates a system that cannot be tested against real data.

**Delivers:** Any team member can authenticate with their Basecamp account and receive a stored, auto-refreshing access token. OAuth callback hosted at `/oauth/callback`. Token revocation endpoint live.

**Addresses (from FEATURES.md):** OAuth 2.0 Authentication Flow (table stakes #7); account_id resolution from `/authorization.json`

**Avoids (from PITFALLS.md):** Pitfall 1.1 (per-user token architecture), 1.2 (token refresh), 1.3 (read-only enforcement), 1.4 (revocation), 4.3 (multi-account discovery)

**Stack used:** `simple-oauth2`, `better-sqlite3`, `express`

**Research flag:** Standard — OAuth 2.0 Authorization Code flow is well-documented. Basecamp's Launchpad endpoints are fully documented in bc3-api. No additional research needed.

---

### Phase 2: API Client Infrastructure

**Rationale:** The API Client must be built before any MCP tool — it is the shared foundation all tools sit on. Rate limiting and pagination in particular must exist before testing any tool with real project data, or they will break on any non-trivial project.

**Delivers:** A `BasecampClient` class that wraps all 6 content type endpoints, handles 429s with backoff, follows `Link` header pagination, converts HTML to markdown, and returns normalized response schemas. No MCP tooling yet — only the HTTP client.

**Addresses (from FEATURES.md):** Rate limit handling (table stakes #8); HTML-to-Markdown stripping (differentiator #2); pagination envelope (differentiator #3); normalized metadata envelopes (differentiator #4)

**Avoids (from PITFALLS.md):** Pitfall 2.1 (rate limits), 2.2 (pagination), 3.1 (HTML stripping), 3.2 (attachment tag handling), 4.4 (normalized schema), 5.1 (response size limits), 5.3 (attachment size checks)

**Stack used:** `got` v14, `zod` (response normalization)

**Research flag:** Standard — Basecamp 3 API is well-documented. `got` v14 retry and pagination patterns are established. No additional research needed.

---

### Phase 3: MCP Tool Definitions

**Rationale:** With the API Client stable and tested, tool definitions are straightforward wiring — zod schemas translate agent inputs into API Client calls. This is where the 11 tools are defined, described, and tested end-to-end using MCP Inspector.

**Delivers:** All 11 MCP tools functional and testable in isolation via MCP Inspector. Tool descriptions written for agent comprehension. Dock introspection in `get_project_tools` auto-resolving internal IDs. Typed error responses (`TOKEN_EXPIRED`, `RATE_LIMITED`, `NOT_FOUND`, `TOOL_NOT_ENABLED`).

**Addresses (from FEATURES.md):** All 8 table-stakes features; differentiators 1 (dock introspection), 5 (project scoping), 6 (status filter), 7 (to-do completion filter), 8 (typed errors)

**Avoids (from PITFALLS.md):** Pitfall 4.1 (tool count), 4.2 (tool descriptions), 2.3 (on-demand fetching), 6.1 (campfire time bounds)

**Stack used:** `@modelcontextprotocol/sdk`, `zod`

**Research flag:** Standard — MCP tool definition patterns are documented by Anthropic. Zod schema patterns are established. No additional research needed.

---

### Phase 4: Transport and Agent Integration

**Rationale:** HTTP transport wiring comes after tools are defined and working. This phase connects the tool layer to real agents (Claude Desktop, Cursor) and validates the multi-user session-to-user binding.

**Delivers:** A running MCP server on Streamable HTTP transport. Multiple team members can connect their AI agents simultaneously, each authenticated as themselves. Bearer auth middleware validates per-session identity. End-to-end smoke test with a real agent completing a multi-tool task on a real Basecamp project.

**Addresses (from FEATURES.md):** MCP compatibility with Claude Desktop / Cursor; multi-user OAuth model

**Stack used:** `@modelcontextprotocol/sdk` (StreamableHTTPServerTransport), `express`

**Research flag:** May need light research. Streamable HTTP transport in MCP SDK is newer than stdio. Session-to-user binding patterns are less documented. Recommend reviewing MCP SDK changelog and examples before implementing session management.

---

### Phase 5: Hardening

**Rationale:** The final phase secures the server for shared team use — proper error handling, input validation coverage, HTTPS, token revocation, caching to reduce rate-limit pressure, and test coverage. Deferred to last because there is no point hardening components that may still be changing.

**Delivers:** Production-ready server. In-memory cache with per-resource TTLs. Full `vitest` test suite. HTTPS termination configured. Token revocation endpoint. `stdio` transport fallback for local single-user development (`TRANSPORT=stdio` env flag).

**Avoids (from PITFALLS.md):** Pitfall 5.2 (caching), 1.4 (token revocation confirmed)

**Stack used:** `vitest`, caching layer (in-memory Map with TTL)

**Research flag:** Standard — hardening patterns are well-established. No additional research needed.

---

### Phase Ordering Rationale

- OAuth must come first because every API call requires an authenticated token; no tool can be tested without it
- API Client must come before MCP tools because rate-limit and pagination infrastructure must exist before any tool is stable on real data — discovering this gap later means reworking all tools
- MCP tools before transport because tools can be unit-tested in isolation (MCP Inspector) without a live HTTP server; separating this phase makes debugging cleaner
- Transport before hardening because validating multi-user session behavior requires a working end-to-end system; hardening before validation wastes effort on things that may change
- Write operations (create, update, delete) are explicitly a v2 concern — deferred to avoid scope creep and extra OAuth scope risk in v1

---

### Research Flags

Phases needing deeper research during planning:
- **Phase 4 (Transport):** Streamable HTTP transport session-to-user binding is less documented than stdio patterns. Review MCP SDK `^1.6.x` release notes and any published examples of multi-user StreamableHTTPServerTransport before designing the session map.

Phases with standard patterns (skip research-phase):
- **Phase 1 (OAuth):** Basecamp's Launchpad OAuth is well-documented; standard Authorization Code flow
- **Phase 2 (API Client):** Basecamp 3 API has complete REST documentation; `got` v14 retry patterns are established
- **Phase 3 (MCP Tools):** Anthropic's MCP tool definition docs are comprehensive; zod patterns are standard
- **Phase 5 (Hardening):** No novel patterns; standard testing, caching, and HTTPS practices

---

## Key Constraints

These constraints must be reflected in requirements and roadmap milestones:

| Constraint | Detail | Impact |
|------------|--------|--------|
| Rate limit | 50 req/10s per OAuth token | API client must queue and throttle; no fanout patterns |
| Pagination | 15 items per page via `Link` header | All list tools need page parameter; silent truncation is a failure mode |
| HTML content | All rich text is HTML | Server-side markdown conversion required before any tool returns content |
| Multi-user OAuth | Per-user token store required | Cannot share one credential across team; per-user SQLite records |
| v1 read-only | No write operations | Block all non-GET methods in API client; scope enforcement at server layer |
| Response size | Agent context window limits | 100-item / 50KB hard cap per tool response |
| Campfire volume | High message frequency | `since` / `limit` required on all campfire queries; no unbounded fetch |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | TypeScript MCP SDK is Anthropic's reference implementation; Basecamp 3 API is documented at github.com/basecamp/bc3-api; library choices validated against MCP docs |
| Features | HIGH | Basecamp 3 API endpoints confirmed; tool inventory derived directly from documented endpoints; dependency ordering matches API structure |
| Architecture | HIGH | Four-component boundary is canonical for MCP servers; transport decision is well-reasoned and confirmed by MCP spec; token storage pattern is standard |
| Pitfalls | HIGH | 17 pitfalls identified from Basecamp API docs (rate limits, pagination specs are stated); MCP tool design pitfalls from MCP SDK docs and patterns |

**Overall confidence: HIGH**

### Gaps to Address

- **MCP SDK `StreamableHTTPServerTransport` session management:** The session-to-user binding pattern (mapping session IDs to Basecamp user IDs) is architectural inference rather than a documented SDK pattern. Validate this during Phase 4 planning by reviewing SDK source and any published multi-user MCP examples.
- **Basecamp token expiry duration:** The exact access token TTL is not published in the Basecamp docs. The refresh strategy handles this correctly regardless, but validating that refresh tokens do not expire on inactivity is worth a quick test after first OAuth flow.
- **Dock `type` field values:** The research assumes specific `type` string values for dock items (e.g., `"Message::Board"`, `"Todoset"`). Confirm actual values against a live Basecamp account during Phase 2 API client development.

---

## Sources

### Primary (HIGH confidence)
- `github.com/basecamp/bc3-api` — Basecamp 3 REST API documentation; rate limits, pagination, endpoint schemas, OAuth Launchpad URLs
- `modelcontextprotocol.io/docs/concepts/` — MCP architecture, transports, tools, and SDK reference
- `launchpad.37signals.com` — 37signals OAuth (Authorization Code flow, token exchange, identity endpoint)

### Secondary (MEDIUM confidence)
- `@modelcontextprotocol/sdk` package documentation — StreamableHTTPServerTransport and tool definition patterns
- `got` v14 documentation — ESM-native HTTP client, retry, and pagination helpers

### Tertiary (LOW confidence)
- Inferred: exact Basecamp OAuth token expiry duration — handle via refresh-on-401 pattern
- Inferred: MCP multi-user session-to-user binding patterns — validate during Phase 4

---
*Research completed: 2026-02-19*
*Ready for roadmap: yes*
