# Architecture: Basecamp MCP Server

*Researched: 2026-02-19*

## Summary

An MCP server exposes tools to AI agents over one of two transports: **stdio** (subprocess, single-user) or **Streamable HTTP** (networked, multi-user). For multi-user team OAuth, the correct transport is **Streamable HTTP** — stdio cannot hold per-user token state across multiple callers.

Four components with clean boundaries:

1. **OAuth Layer** — Basecamp authorization code flow, token storage, refresh
2. **API Client Layer** — Basecamp 3 REST API wrapper, rate limits, pagination
3. **MCP Tool Layer** — tool definitions and handlers
4. **Transport + Session Layer** — HTTP server, MCP sessions, bearer auth middleware

---

## Transport Decision: stdio vs Streamable HTTP

| Factor | stdio | Streamable HTTP |
|--------|-------|-----------------|
| Multi-user support | No — one process per agent | Yes — one server, many concurrent clients |
| OAuth callback possible? | No — no HTTP listener | Yes — hosts `/oauth/callback` |
| Token storage | Per-process, one user | Centralized, keyed by user |
| Claude Desktop / Cursor | Yes (via `command` config) | Yes (via `url` config) |
| Team deployment | Fragile — each user runs their own binary | Correct — one shared server |

**Decision: Streamable HTTP.**

Rationale: Multi-user OAuth is the defining requirement. Stdio gives every agent instance an isolated process with no way to share the OAuth callback handler or a centralized token store. HTTP lets one server host the OAuth redirect URI, persist tokens per user, and serve all agent clients. Production = HTTP; local single-user dev testing = stdio (via `TRANSPORT=stdio` env flag with a single token from env).

---

## Component Boundaries

### Component 1: Transport + Session Layer

**Responsibility:** HTTP server, MCP sessions, bearer auth, session-to-user mapping.

What lives here:
- Express HTTP server
- `POST /mcp`, `GET /mcp`, `DELETE /mcp` — MCP endpoint
- `GET /oauth/start` — initiates Basecamp auth code flow
- `GET /oauth/callback` — receives Basecamp redirect
- Bearer auth middleware — validates the token the agent sends when connecting to *this* server
- Session map: `{ [sessionId]: StreamableHTTPServerTransport }`
- Session-to-user binding: after auth, each session knows which Basecamp user it belongs to

Does NOT: call Basecamp directly, implement OAuth exchange logic, define tool behavior.

---

### Component 2: OAuth Layer

**Responsibility:** Own the entire Basecamp OAuth 2.0 authorization code flow and per-user token lifecycle.

Basecamp OAuth specifics:
- App registration: `https://launchpad.37signals.com` (get `client_id` + `client_secret`)
- Authorization URL: `https://launchpad.37signals.com/authorization/new?type=web_server&client_id=<id>&redirect_uri=<uri>`
- Token exchange: `POST https://launchpad.37signals.com/authorization/token`
- Identity: `GET https://launchpad.37signals.com/authorization.json` → returns user info + `accounts[]` (filter `product: "bc3"` to get `account_id`)
- Token refresh: `POST https://launchpad.37signals.com/authorization/token?type=refresh&refresh_token=<token>&client_id=<id>&client_secret=<secret>`

What lives here:
- `startAuthFlow(redirectUri)` → returns authorization URL
- `handleCallback(code)` → exchanges code, fetches identity, resolves `account_id`, persists tokens
- `getTokenForUser(userId)` → returns valid access token, auto-refreshing if near expiry
- `TokenStore` → persists `{ userId → { accessToken, refreshToken, expiresAt, accountId } }`

Does NOT: know about MCP sessions, call Basecamp project APIs.

---

### Component 3: API Client Layer

**Responsibility:** Wrap the Basecamp 3 REST API — translate tool arguments into HTTP calls, handle pagination, rate limits, and response normalization.

Basecamp 3 API specifics:
- Base URL: `https://3.basecampapi.com/{account_id}/`
- All requests: `Authorization: Bearer <token>` + `User-Agent: AppName (contact@example.com)`
- Rate limits: 50 req/10s per token — handle `429` with `Retry-After`
- Pagination: `Link` header with `rel="next"` for multi-page collections
- Rich text fields return HTML — normalize to markdown before returning

API calls per tool:

| Tool | Basecamp Endpoint |
|------|-------------------|
| `list_projects` | `GET /projects.json` |
| `list_messages` | `GET /buckets/{id}/message_boards/{board_id}/messages.json` |
| `list_todos` | `GET /buckets/{id}/todosets/{id}/todolists.json` → per-list todos |
| `list_documents` | `GET /buckets/{id}/vaults/{vault_id}/documents.json` |
| `list_campfire_lines` | `GET /buckets/{id}/chats/{chat_id}/lines.json` |
| `list_attachments` | `GET /buckets/{id}/vaults/{vault_id}/attachments.json` |

Note: messages/todos/docs/campfire/files require first fetching the project to find dock item IDs. The client handles this two-step lookup transparently.

What lives here:
- `BasecampClient` — instantiated per-call with user's `accessToken` + `accountId`
- Per-resource methods for all 6 content types
- `paginate(url)` — follows `Link` headers to collect all pages
- `withRateLimit(fn)` — respects 429, retries with backoff
- Response normalization + HTML-to-markdown

Does NOT: handle OAuth flow, know about MCP sessions.

---

### Component 4: MCP Tool Layer

**Responsibility:** Define the MCP tools and implement handler logic — translate `tools/call` arguments into API Client calls and format responses as MCP content.

Tool definitions:

```
list_projects
  input: { status?: "active"|"archived"|"all" }
  output: projects with id, name, description, status

list_messages
  input: { project_id: string, page?: number }
  output: message threads with subject, author, created_at, content (markdown)

list_todos
  input: { project_id: string, completed?: boolean, page?: number }
  output: todo lists with tasks, assignees, due dates, completion status

list_documents
  input: { project_id: string, page?: number }
  output: documents with title, author, created_at, content (markdown, truncated)

get_document
  input: { project_id: string, document_id: string }
  output: full document content (markdown)

list_campfire_lines
  input: { project_id: string, limit?: number, since?: string }
  output: chat messages with author, timestamp, content

list_attachments
  input: { project_id: string, page?: number }
  output: files with filename, byte_size, download_url, creator, created_at
```

Does NOT: own HTTP routing, call Basecamp directly, store tokens.

---

## Data Flow

### First-Time User Authentication

```
[Team member's browser]
  1. GET /oauth/start?user=het
  → OAuthService.startAuthFlow() → redirect to launchpad.37signals.com
  → User logs in to Basecamp, grants consent
  → Basecamp redirects to /oauth/callback?code=abc123
  2. GET /oauth/callback
  → OAuthService.handleCallback(code):
      a. POST launchpad token exchange → { access_token, refresh_token }
      b. GET launchpad identity → user info + account_id
      c. TokenStore.save(userId, { accessToken, refreshToken, expiresAt, accountId })
  → Token persisted, user redirected to success page
```

### Agent Tool Call (Steady State)

```
[AI Agent: Claude Desktop / Cursor]
  1. POST /mcp  Authorization: Bearer <mcp-session-token>
     Body: tools/call list_todos { project_id: "123" }

[Transport Layer]
  2. Validate bearer token → resolve to userId
  3. Dispatch to MCP session transport → Tool Layer

[MCP Tool Layer: list_todos handler]
  4. OAuthService.getTokenForUser(userId)
     → token valid: return accessToken + accountId
     → token expiring: auto-refresh, update store, return new token

[API Client Layer]
  5. BasecampClient(accessToken, accountId).getTodos(projectId):
     a. GET /projects/{id}.json → find todoset dock item id
     b. GET /buckets/{id}/todosets/{id}/todolists.json → lists
     c. GET /buckets/{id}/todolists/{id}/todos.json per list
     d. Paginate all pages, normalize, strip HTML

[Tool Layer]
  6. Format: { content: [{ type: "text", text: "# Todo Lists..." }] }

[Transport Layer]
  7. Send MCP response to agent
```

---

## Multi-User Token Storage

```typescript
interface TokenRecord {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  accountId: string;       // Basecamp 3 account id
  basecampUserId: number;
  email: string;
}
```

| Tier | Store | Notes |
|------|-------|-------|
| Dev | In-memory Map | Lost on restart; fine for dev |
| Production (simple) | File-backed JSON (encrypted) | Survives restarts |
| Production (robust) | SQLite | Handles restarts + concurrent writes — preferred |

**Session-to-user binding:** Each MCP session is tagged with `userId`. On every `tools/call`, the server looks up `userId` from session → `TokenStore.get(userId)`.

**Concurrency safety:** Multiple concurrent tool calls for the same user must not trigger duplicate refresh requests. Per-user mutex or "refresh in progress" flag. Basecamp issues a new refresh token on each refresh — both tokens updated atomically.

---

## Suggested Build Order

| Phase | Component | Deliverable |
|-------|-----------|-------------|
| 1 | OAuth Layer | Any team member can auth against Basecamp and return a valid token |
| 2 | API Client Layer | All 6 content types confirmed accessible from Basecamp 3 API |
| 3 | MCP Tool Layer | All tools return correct data; testable with MCP Inspector |
| 4 | Transport + Session Layer | Real agent (Claude Desktop/Cursor) connects and invokes tools |
| 5 | Hardening | SQLite token store, error handling, HTTPS, input validation |

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Transport | Streamable HTTP | Multi-user OAuth requires HTTP for callback + shared token store |
| MCP-level auth v1 | Static bearer token per user in agent config | Simple; no extra infrastructure; upgrade to OAuth 2.1 in v2 |
| Token storage | SQLite | Zero infrastructure; survives restarts; handles concurrent reads; upgradeable to Postgres |
| HTML handling | Server-side markdown conversion | Happens in API Client Layer once — not per-tool |

---

## Sources

- MCP Architecture: https://modelcontextprotocol.io/docs/concepts/architecture
- MCP Transports: https://modelcontextprotocol.io/docs/concepts/transports
- MCP Tools: https://modelcontextprotocol.io/docs/concepts/tools
- Basecamp 3 API: https://github.com/basecamp/bc3-api
- 37signals OAuth (Launchpad): https://launchpad.37signals.com
