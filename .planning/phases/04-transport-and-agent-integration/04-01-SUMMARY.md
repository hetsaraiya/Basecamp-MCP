---
phase: 04-transport-and-agent-integration
plan: "01"
subsystem: transport
tags: [streamable-http, session-management, mcp-token, oauth, stdio]
dependency_graph:
  requires: [03-02]
  provides: [streamable-http-transport, per-user-mcp-url, session-lifecycle, index-entry-point]
  affects: [src/auth/store.ts, src/server.ts, src/index.ts, package.json]
tech_stack:
  added: [StreamableHTTPServerTransport]
  patterns: [session-map, per-user-url-routing, transport-conditional-entry-point]
key_files:
  created: [src/index.ts]
  modified: [src/auth/store.ts, src/server.ts, package.json]
decisions:
  - "mcp_token stored as UUID in SQLite; getByMcpToken() resolves URL key to TokenRecord — no Authorization header needed (confirmed per STATE.md decision)"
  - "sessions Map<string, Session> used for O(1) session-to-user binding; onsessioninitialized fires before response so Map is populated before any tool call can arrive"
  - "TRANSPORT=stdio uses dynamic import to avoid loading Express/StreamableHTTP in stdio mode"
  - "randomUUID() imported from node:crypto for explicit type safety under NodeNext moduleResolution"
metrics:
  duration: "7 min"
  completed: "2026-02-19"
  tasks_completed: 4
  files_modified: 4
---

# Phase 4 Plan 01: Streamable HTTP Transport and Per-User Session Lifecycle Summary

**One-liner:** Streamable HTTP transport wired into Express with per-user /mcp/<uuid> URL routing, session Map lifecycle management, and a TRANSPORT-conditional index.ts entry point.

## What Was Built

This plan makes the MCP server connectable by real agents. Four changes collectively deliver per-user agent connectivity:

1. **`src/auth/store.ts`** — Added `mcp_token TEXT` column via idempotent `ALTER TABLE` migration (try/catch for existing column). `saveMcpToken(userId, mcpToken)` persists the UUID after OAuth. `getByMcpToken(mcpToken)` resolves the URL path param to a `TokenRecord` for authentication.

2. **`src/server.ts` (OAuth callback)** — `/oauth/callback` now generates a stable UUID via `randomUUID()`, calls `saveMcpToken()`, and returns `{ mcp_url: "http://host/mcp/<uuid>", user: {...} }` so users can paste the URL directly into Claude Desktop or Cursor.

3. **`src/server.ts` (MCP route)** — `app.all('/mcp/:userToken')` handles the full session lifecycle: 401 for unknown tokens, DELETE closes transport and removes from Map, existing `Mcp-Session-Id` routes to established session, new initialization creates `StreamableHTTPServerTransport` + `createTools(userId, tokenStore)`, registers in `sessions` Map via `onsessioninitialized`, and cleans up via `transport.onclose`.

4. **`src/index.ts` + `package.json`** — New main entry point. `TRANSPORT=stdio` validates `BASECAMP_USER_ID`, dynamically imports `StdioServerTransport`, creates tools for that user. HTTP mode dynamically imports `server.ts` and calls `startServer()`. Package scripts updated: `dev` and `mcp` target `src/index.ts`.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 2b1a1d9 | feat(04-01): add mcp_token column and getByMcpToken/saveMcpToken to TokenStore |
| 2 | ab8983b | feat(04-01): update OAuth callback to generate mcp_token and return mcp_url |
| 3 | 6fae735 | feat(04-01): add /mcp/:userToken route with StreamableHTTPServerTransport session lifecycle |
| 4 | 2d9706e | feat(04-01): create src/index.ts entry point with TRANSPORT=stdio conditional |

## Verification Results

- `npx tsc --noEmit` passes with zero errors after all tasks
- `getByMcpToken`, `saveMcpToken`, `mcp_token`, `ALTER TABLE` all present in `src/auth/store.ts`
- `StreamableHTTPServerTransport`, `onsessioninitialized`, `sessions.set`, `sessions.delete` all present in `src/server.ts`
- `mcp_url` returned in OAuth callback response
- `TRANSPORT=stdio` conditional in `src/index.ts`
- `package.json` scripts: `dev` → `tsx watch src/index.ts`, `start` → `node dist/index.js`, `mcp` → `TRANSPORT=stdio tsx src/index.ts`

## Deviations from Plan

None — plan executed exactly as written. `randomUUID` imported from `node:crypto` as recommended in important_notes to avoid tsc complaints, and `import 'dotenv/config'` added to `src/index.ts` to match the pattern in `src/server.ts` and `src/mcp.ts`.

## Success Criteria Status

1. [x] TokenStore.getByMcpToken(mcpToken) resolves UUID to TokenRecord (or null for unknown)
2. [x] TokenStore.saveMcpToken(userId, mcpToken) persists UUID to mcp_token column
3. [x] Migration adds mcp_token column idempotently (ALTER TABLE with try/catch)
4. [x] /oauth/callback generates UUID, stores it, returns { mcp_url } (FR-8.5)
5. [x] POST /mcp/:userToken with unknown userToken returns 401
6. [x] POST /mcp/:userToken with known token + no Mcp-Session-Id creates new transport, calls createTools, registers in sessions Map
7. [x] Subsequent POST/GET with Mcp-Session-Id routes to existing session
8. [x] DELETE /mcp/:userToken closes transport and removes session from Map
9. [x] transport.onclose cleans up sessions Map on unexpected disconnect (NFR-6.1)
10. [x] src/index.ts: TRANSPORT=stdio reads BASECAMP_USER_ID, creates tools, connects StdioServerTransport (NFR-6.2)
11. [x] src/index.ts: TRANSPORT unset → startServer() HTTP mode
12. [x] tsc compiles clean — all imports use .js extensions per NodeNext moduleResolution
