# Stack Research: Basecamp MCP

*Researched: 2026-02-19*

## Recommended Stack

### Runtime & Language

| Layer | Choice | Version | Confidence |
|-------|--------|---------|------------|
| Runtime | Node.js | 22 LTS | High |
| Language | TypeScript | 5.7 | High |

**Rationale:** TypeScript MCP SDK is the reference implementation — more mature, more examples, better tooling than the Python SDK for MCP work. Node.js 22 LTS is current stable.

### Core Libraries

| Library | Package | Version | Purpose |
|---------|---------|---------|---------|
| MCP SDK | `@modelcontextprotocol/sdk` | ^1.6.x | MCP tool definitions and transport |
| HTTP client | `got` | v14 | Basecamp API calls — ESM-native, built-in retry + pagination |
| Validation | `zod` | ^3.24 | Tool input schema validation (effectively required by MCP SDK) |
| OAuth | `simple-oauth2` | ^5.x | Basecamp OAuth 2.0 Authorization Code flow |
| Web framework | `express` | 4.21 | OAuth callback endpoint + MCP HTTP endpoint |
| Token storage | `better-sqlite3` | ^9.x | Per-user token storage (access + refresh token, keyed by user ID) |
| Testing | `vitest` | ^2.1 | Native ESM support, Jest-compatible API |

### MCP Transport Decision

**Use `StreamableHTTPServerTransport`** (not stdio) for multi-user OAuth use case.

- **stdio transport**: Single-user, single process — cannot handle per-user token state
- **HTTP/SSE transport**: Supports multiple concurrent users, each with their own session and OAuth token
- Basecamp OAuth callback requires an HTTP server anyway, so HTTP transport is natural

### What NOT to Use

| Option | Why Not |
|--------|---------|
| Python MCP SDK | Less mature for production MCP servers; TypeScript SDK is the reference |
| `axios` | CommonJS-first; `got` v14 is ESM-native and has better retry built in |
| `passport.js` | Overkill for a single OAuth provider; `simple-oauth2` is lighter |
| Redis for token storage | Unnecessary infrastructure for a team tool; SQLite handles it fine |
| `node-fetch` / `fetch` | No built-in retry or rate-limit handling; critical given Basecamp's 50 req/10s limit |

### Token Storage Strategy

`better-sqlite3` — per-user record with:
- `user_id` (Basecamp user ID)
- `access_token`
- `refresh_token`
- `expires_at` timestamp

Auto-refresh on expiry before each API call. Upgrade to Postgres in v2 if multi-instance deployment needed.

### Project Structure

```
src/
  server.ts          # Express app + MCP HTTP endpoint
  auth/
    oauth.ts         # OAuth flow (authorize, callback, refresh)
    store.ts         # SQLite token storage
  basecamp/
    client.ts        # Authenticated Basecamp API client
    projects.ts      # List projects
    messages.ts      # Message board threads
    todos.ts         # To-do lists and tasks
    docs.ts          # Docs
    campfire.ts      # Campfire chat
    files.ts         # File attachments
  mcp/
    tools.ts         # MCP tool definitions (zod schemas + handlers)
    index.ts         # MCP server setup
```

---
*Confidence: High — TypeScript MCP SDK is official Anthropic reference; stack validated against MCP docs and Basecamp 3 API docs.*
