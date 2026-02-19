# Roadmap: Basecamp MCP

## Project Goal

Any OpenXcell team member can connect their AI agent to a running MCP server, authenticate with their own Basecamp account, and have that agent pull live project data — messages, to-dos, docs, campfire chat, and file attachments — as structured on-demand tools.

## v1 Done When

- A team member can authenticate via OAuth and their token auto-refreshes
- A real agent (Claude Desktop or Cursor) can list projects and call any of the 11 tools against live Basecamp data
- No raw HTML reaches the agent; all content is markdown
- A 429 from Basecamp does not crash a tool call
- Multiple team members can be authenticated simultaneously without their data crossing
- The server is running over HTTPS and has a test suite

---

## Phases

- [x] **Phase 1: OAuth Foundation** - Any team member can authenticate with Basecamp and receive a stored, auto-refreshing token (completed 2026-02-19)
- [ ] **Phase 2: API Client Infrastructure** - A BasecampClient that handles all 6 content types with rate limiting, pagination, and HTML-to-markdown
- [ ] **Phase 3: MCP Tool Definitions** - All 11 MCP tools functional and testable in MCP Inspector
- [ ] **Phase 4: Transport and Agent Integration** - Real agents (Claude Desktop, Cursor) can connect and use tools with per-user auth
- [ ] **Phase 5: Hardening** - Production-ready for the OpenXcell team

---

## Phase Details

### Phase 1: OAuth Foundation
**Goal**: Any team member can authenticate with their Basecamp account via OAuth and receive a stored, auto-refreshing access token — the server can make authenticated API calls on that user's behalf without re-prompting.
**Why this order**: Nothing in this system can be tested against real Basecamp data without an authenticated token. OAuth is the ground layer every other component builds on.
**Depends on**: Nothing (first phase)
**Requirements**: FR-1.1, FR-1.2, FR-1.3, FR-1.4, FR-1.5, FR-1.6
**Stack**: `simple-oauth2` ^5.x, `better-sqlite3` ^9.x, `express` 4.21
**Research needed**: None — Basecamp Launchpad OAuth is fully documented; standard Authorization Code flow.
**Success Criteria** (what must be TRUE):
  1. A team member visits `/oauth/start`, completes the Basecamp Launchpad flow, and is redirected back with a stored token
  2. Their `access_token`, `refresh_token`, and `expires_at` are persisted in SQLite keyed by Basecamp user ID
  3. A subsequent API call on their behalf uses the stored token; if the token is expired, it is silently refreshed before the call proceeds
  4. A `401` from Basecamp triggers one refresh attempt; if the refresh fails, the caller receives a `TOKEN_EXPIRED` error with a re-auth URL
  5. A team member can hit `/oauth/revoke`, which calls Basecamp's delete endpoint and removes their local token record
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Project scaffolding + OAuth flow (package.json, tsconfig, Express server, `/oauth/start`, `/oauth/callback`, `simple-oauth2`, account_id resolution from Launchpad)
- [ ] 01-02-PLAN.md — Token store (SQLite schema, `TokenStore` class, per-user mutex, `getTokenForUser()` with auto-refresh, `TOKEN_EXPIRED` error, `/oauth/revoke` endpoint)

---

### Phase 2: API Client Infrastructure
**Goal**: A `BasecampClient` class that wraps all six content-type endpoints, respects Basecamp's rate limit with backoff, follows Link-header pagination, converts all HTML to markdown, and returns normalized response schemas — ready for MCP tools to call without knowing anything about HTTP.
**Why this order**: Tools sit on top of the API client. If rate limiting and pagination are absent when tools are built, every tool that hits real project data will behave incorrectly and require rework. The infrastructure must be solid before wiring begins.
**Depends on**: Phase 1
**Requirements**: NFR-1.1, NFR-1.2, NFR-1.3, NFR-2.1, NFR-2.2, NFR-2.3, NFR-3.1, NFR-3.2, NFR-3.3, NFR-4.1, NFR-4.2, NFR-4.3, NFR-4.4, NFR-5.1, NFR-5.2, NFR-5.3
**Stack**: `got` v14, `zod` ^3.24
**Research needed**: None — Basecamp 3 API is documented; `got` v14 retry patterns are established.
**Success Criteria** (what must be TRUE):
  1. A `BasecampClient` call to any of the 6 content-type endpoints returns a normalized, typed response (not raw Basecamp JSON)
  2. When Basecamp returns a 429, the client waits the `Retry-After` duration and retries automatically; the caller never sees a 429 error
  3. A list call to a paginated endpoint returns `{ items, has_more, next_page }` and correctly signals when more pages exist
  4. No tool response ever contains raw HTML — all rich-text fields are markdown, including Basecamp-specific tags (`<bc-attachment>`, `<mention>`)
  5. Non-GET HTTP methods cannot be dispatched through the client — a write attempt throws at the client layer
**Plans**: 2 plans

Plans:
- [x] 02-01: HTTP client core — `got` v14 instance, `withRateLimit()` (Retry-After + exponential backoff + jitter), concurrent request cap, read-only enforcement
- [ ] 02-02: Content layer — `paginate()` following Link headers, HTML-to-markdown pipeline (including `<bc-attachment>`, `<mention>`, `<bc-gallery>`), zod response schemas for all 6 content types, response size enforcement (100-item / 50KB cap)

---

### Phase 3: MCP Tool Definitions
**Goal**: All 11 MCP tools are defined, described for agent comprehension, and callable end-to-end via MCP Inspector — each tool translates agent inputs into API Client calls and returns structured MCP content envelopes with typed errors.
**Why this order**: Tools can be developed and unit-tested against the API client in isolation, without a live HTTP transport. Separating tool definition from transport wiring makes debugging faster — a failing tool is a tool problem, not a transport problem.
**Depends on**: Phase 2
**Requirements**: FR-2.1, FR-2.2, FR-2.3, FR-2.4, FR-3.1, FR-3.2, FR-3.3, FR-3.4, FR-4.1, FR-4.2, FR-4.3, FR-4.4, FR-5.1, FR-5.2, FR-5.3, FR-6.1, FR-6.2, FR-6.3, FR-7.1, FR-7.2, FR-8.1, FR-8.2, FR-8.3, FR-8.4
**Stack**: `@modelcontextprotocol/sdk` ^1.15.0, `zod` ^4.3.6
**Research needed**: None — MCP tool definition patterns are documented by Anthropic; zod schema patterns are standard.
**Success Criteria** (what must be TRUE):
  1. MCP Inspector lists all 11 tools with correct names, descriptions, and input schemas
  2. `list_projects` called from MCP Inspector returns real projects from the authenticated user's Basecamp account
  3. Any tool call with an invalid input (missing required field, wrong type) returns a structured MCP error with `isError: true` and a typed `error_code`
  4. `get_project_tools` resolves internal Basecamp IDs (`message_board_id`, `todoset_id`, `vault_id`, `chat_id`) automatically from the dock — the agent never needs to supply them
  5. Campfire queries without explicit `since` or `limit` default to the last 24 hours of messages
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — SDK install + BasecampClient.getProject() + typed error module (errors.ts) + createTools() factory with 7 tools: `list_projects`, `get_project_tools`, `list_messages`, `get_message`, `list_todolists`, `list_todos`, `get_todo`
- [ ] 03-02-PLAN.md — 4 remaining tools (`list_documents`, `get_document`, `list_campfire_lines`, `list_attachments`) + stdio entry point (src/mcp.ts) + MCP Inspector verification checkpoint

---

### Phase 4: Transport and Agent Integration
**Goal**: Real agents (Claude Desktop, Cursor) can connect to the MCP server over Streamable HTTP transport, each session is bound to exactly one authenticated Basecamp user, and a multi-tool agent task completes end-to-end against live Basecamp data.
**Why this order**: Transport wiring comes after tools are proven in MCP Inspector. A working tool layer makes integration debugging unambiguous — any failure is a session or transport issue, not a tool issue.
**Depends on**: Phase 3
**Requirements**: FR-8.5, NFR-6.1, NFR-6.2
**Stack**: `@modelcontextprotocol/sdk` (StreamableHTTPServerTransport), `express` 4.21
**Research needed**: Resolved 2026-02-19 — StreamableHTTPServerTransport session-to-user binding confirmed via SDK source inspection. Auth model decided: unique URL per user (/mcp/:userToken), no Authorization header. Session-map pattern chosen.
**Success Criteria** (what must be TRUE):
  1. Claude Desktop or Cursor connects to the server and lists tools without error
  2. Two team members can be connected simultaneously; each agent's tool calls return data from only that user's Basecamp account
  3. An agent completes a multi-tool task (e.g., `list_projects` → `list_messages` → `get_message`) against a real Basecamp project
  4. With `TRANSPORT=stdio` set, the server starts in stdio mode using a token from the environment — no OAuth flow needed
**Plans**: 2 plans

Plans:
- [ ] 04-01-PLAN.md — mcp_token column + TokenStore.getByMcpToken() + OAuth callback issues personal MCP URL + /mcp/:userToken POST/GET/DELETE route with StreamableHTTPServerTransport + sessions Map + src/index.ts TRANSPORT conditional entry point
- [ ] 04-02-PLAN.md — Pre-flight automated checks + human smoke test (agent connection, multi-tool task, session isolation, stdio mode verification)

---

### Phase 5: Hardening
**Goal**: The server is production-ready for the OpenXcell team — in-memory caching reduces rate-limit pressure, a vitest suite covers critical paths, HTTPS is configured, and a developer can run single-user stdio mode locally without an OAuth UI.
**Why this order**: Hardening deferred to last because there is no value in optimizing components that are still changing. Once Phase 4 proves the system works end-to-end, hardening locks it in.
**Depends on**: Phase 4
**Requirements**: NFR-1.3, NFR-5.4, NFR-6.2, FR-1.6
**Stack**: `vitest` ^2.1, in-memory Map with TTL
**Research needed**: None — standard testing, caching, and HTTPS patterns.
**Success Criteria** (what must be TRUE):
  1. A repeated `list_projects` call within the cache TTL window returns immediately without hitting the Basecamp API
  2. The vitest suite runs and passes — covering OAuth flow, token refresh, rate-limit backoff, pagination, HTML-to-markdown conversion, and tool error paths
  3. The server accepts connections over HTTPS in its production configuration
  4. A developer can start the server with `TRANSPORT=stdio` and a token env var, call a tool, and get a real response — no browser OAuth required
**Plans**: 2 plans

Plans:
- [ ] 05-01: Caching and test suite — per-resource TTL cache (Map-based), vitest coverage for OAuth, API client (rate limit, pagination, HTML conversion), tool error paths
- [ ] 05-02: Production config — HTTPS termination, environment-based config (port, SQLite path, OAuth credentials), final token revocation verification, deployment checklist

---

## Requirement Coverage

| Requirement | Phase | Description |
|-------------|-------|-------------|
| FR-1.1 | Phase 1 | OAuth 2.0 Authorization Code flow per user |
| FR-1.2 | Phase 1 | `/oauth/callback` endpoint |
| FR-1.3 | Phase 1 | account_id resolved and stored from Launchpad |
| FR-1.4 | Phase 1 | Tokens stored in SQLite per user |
| FR-1.5 | Phase 1 | Auto-refresh on expiry / 401 |
| FR-1.6 | Phase 1 | Token revocation endpoint |
| FR-2.1 | Phase 3 | `list_projects` tool |
| FR-2.2 | Phase 3 | `status` parameter on `list_projects` |
| FR-2.3 | Phase 3 | Project response shape |
| FR-2.4 | Phase 3 | Dock introspection for internal IDs |
| FR-3.1 | Phase 3 | `list_messages` tool |
| FR-3.2 | Phase 3 | `get_message` tool |
| FR-3.3 | Phase 3 | Message content as markdown |
| FR-3.4 | Phase 3 | Message response shape |
| FR-4.1 | Phase 3 | `list_todolists` tool |
| FR-4.2 | Phase 3 | `list_todos` tool |
| FR-4.3 | Phase 3 | `get_todo` tool |
| FR-4.4 | Phase 3 | Task response shape |
| FR-5.1 | Phase 3 | `list_documents` tool with truncated content |
| FR-5.2 | Phase 3 | `get_document` tool |
| FR-5.3 | Phase 3 | Document response shape |
| FR-6.1 | Phase 3 | `list_campfire_lines` tool |
| FR-6.2 | Phase 3 | Default 24h window for campfire |
| FR-6.3 | Phase 3 | Campfire line response shape |
| FR-7.1 | Phase 3 | `list_attachments` tool |
| FR-7.2 | Phase 3 | Metadata-only response for attachments |
| FR-8.1 | Phase 3 | MCP handshake (`initialize`/`initialized`) |
| FR-8.2 | Phase 3 | Tool name, description, inputSchema conformance |
| FR-8.3 | Phase 3 | Typed error responses with `isError: true` |
| FR-8.4 | Phase 3 | Error codes (TOKEN_EXPIRED, NOT_FOUND, etc.) |
| FR-8.5 | Phase 4 | Streamable HTTP transport (`POST/GET/DELETE /mcp`) |
| NFR-1.1 | Phase 2 | 429 handling with Retry-After |
| NFR-1.2 | Phase 2 | Exponential backoff with jitter |
| NFR-1.3 | Phase 2 | Concurrent request cap per token |
| NFR-2.1 | Phase 2 | Link header pagination parsing |
| NFR-2.2 | Phase 2 | Pagination envelope on list responses |
| NFR-2.3 | Phase 2 | `page` parameter on list tools |
| NFR-3.1 | Phase 2 | HTML-to-markdown conversion |
| NFR-3.2 | Phase 2 | Basecamp-specific tag handling |
| NFR-3.3 | Phase 2 | No raw HTML in tool responses |
| NFR-4.1 | Phase 2 | 100-item cap per list call |
| NFR-4.2 | Phase 2 | 50KB payload cap per tool call |
| NFR-4.3 | Phase 2 | Truncated document list content |
| NFR-4.4 | Phase 2 | No attachment binary content |
| NFR-5.1 | Phase 2 | Read-only enforcement at API client layer |
| NFR-5.2 | Phase 2 | account_id never accepted as user input |
| NFR-5.3 | Phase 2 | Per-user token isolation |
| NFR-5.4 | Phase 5 | HTTPS in production |
| NFR-6.1 | Phase 4 | Claude Desktop / Cursor compatibility |
| NFR-6.2 | Phase 4 | `TRANSPORT=stdio` dev mode flag |

**Coverage: 51/51 v1 requirements mapped. No orphans.**

---

## Out of Scope (v2)

| Feature | Reason deferred |
|---------|-----------------|
| Write operations (create docs, todos, messages) | Extra OAuth scope risk; significant complexity; no team use case established yet |
| Semantic search / RAG | Agent's responsibility — MCP is a context-provider only |
| Webhooks / push-based updates | Requires persistent event queue; polling sufficient for v1 |
| File attachment binary fetching / text extraction | Risk of memory exhaustion; metadata-only sufficient for v1 |
| Multi-account / multi-org support | One org (OpenXcell) is the target; no current use case |
| Schedule / Calendar events | Lower priority than established content types |
| External client access | Internal team only for v1 |

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. OAuth Foundation | 2/2 | Complete   | 2026-02-19 |
| 2. API Client Infrastructure | 1/2 | In Progress | - |
| 3. MCP Tool Definitions | 1/2 | In Progress|  |
| 4. Transport and Agent Integration | 0/2 | Not started | - |
| 5. Hardening | 0/2 | Not started | - |
