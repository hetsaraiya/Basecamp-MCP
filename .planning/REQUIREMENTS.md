# Requirements: Basecamp MCP

**Project:** Basecamp MCP
**Scope:** v1 — Read-only MCP server for OpenXcell team
**Date:** 2026-02-19

---

## Functional Requirements

### FR-1: Authentication

**FR-1.1** — Each team member authenticates with their own Basecamp account via OAuth 2.0 Authorization Code flow.

**FR-1.2** — The server hosts an OAuth callback endpoint (`/oauth/callback`) to receive the authorization code from Basecamp's Launchpad.

**FR-1.3** — After OAuth, the server resolves and stores the user's `account_id` from `GET https://launchpad.37signals.com/authorization.json`. This is required for all subsequent Basecamp API calls.

**FR-1.4** — Access tokens are stored per-user in a persistent store (SQLite), keyed by Basecamp user ID. Both `access_token` and `refresh_token` are stored with `expires_at`.

**FR-1.5** — Tokens are automatically refreshed before expiry. On any 401 response, the server attempts one refresh and retries; if refresh fails, it surfaces a typed `TOKEN_EXPIRED` error with a re-auth URL.

**FR-1.6** — A token revocation endpoint exists (`/oauth/revoke` or similar) so a user can disconnect their account. It calls Basecamp's `DELETE /authorization.json` and removes the local token record.

---

### FR-2: Project Discovery

**FR-2.1** — `list_projects` tool: returns all Basecamp projects the authenticated user can access.

**FR-2.2** — `list_projects` accepts an optional `status` parameter: `"active"` (default), `"archived"`, or `"all"`.

**FR-2.3** — Each project in the response includes: `id`, `name`, `description`, `status`, `created_at`, `updated_at`, and a list of active tool types (from the `dock` array).

**FR-2.4** — Internal Basecamp IDs required for tool calls (`message_board_id`, `todoset_id`, `vault_id`, `chat_id`) are resolved automatically from the project `dock` — never exposed to the agent as required inputs.

---

### FR-3: Message Board

**FR-3.1** — `list_messages` tool: lists message board threads for a project. Required input: `project_id`. Optional: `page`.

**FR-3.2** — `get_message` tool: returns full detail of a message thread including body and comments. Required inputs: `project_id`, `message_id`.

**FR-3.3** — Message content is returned as markdown (not raw HTML).

**FR-3.4** — Each message includes: `id`, `subject`, `author` (name + email), `created_at`, `content` (markdown), `replies_count`.

---

### FR-4: To-Do Lists and Tasks

**FR-4.1** — `list_todolists` tool: lists all to-do lists in a project. Required input: `project_id`. Optional: `page`.

**FR-4.2** — `list_todos` tool: lists tasks within a to-do list. Required inputs: `project_id`, `todolist_id`. Optional: `completed` (boolean, default false), `page`.

**FR-4.3** — `get_todo` tool: returns full task detail including comments. Required inputs: `project_id`, `todo_id`.

**FR-4.4** — Each task includes: `id`, `title`, `description` (markdown), `assignees`, `due_on`, `completed`, `completed_at`, `created_at`, `comments_count`.

---

### FR-5: Documents

**FR-5.1** — `list_documents` tool: lists docs in a project vault. Required input: `project_id`. Optional: `page`. Returns truncated content (first 500 chars) with `truncated: true` flag.

**FR-5.2** — `get_document` tool: returns full document content as markdown. Required inputs: `project_id`, `document_id`.

**FR-5.3** — Each document includes: `id`, `title`, `author` (name + email), `created_at`, `updated_at`, `content` (markdown).

---

### FR-6: Campfire (Chat)

**FR-6.1** — `list_campfire_lines` tool: lists chat messages in a project's Campfire room. Required input: `project_id`. Optional: `since` (ISO 8601 timestamp), `limit` (integer, default 50, max 200).

**FR-6.2** — If neither `since` nor `limit` is specified, default to the last 24 hours of messages.

**FR-6.3** — Each line includes: `id`, `author` (name), `created_at`, `content` (markdown).

---

### FR-7: File Attachments

**FR-7.1** — `list_attachments` tool: lists file attachments in a project. Required input: `project_id`. Optional: `page`.

**FR-7.2** — Returns metadata only — never binary file content. Each attachment includes: `id`, `filename`, `content_type`, `byte_size`, `download_url`, `creator` (name), `created_at`.

---

### FR-8: MCP Protocol Compliance

**FR-8.1** — The server implements the MCP protocol correctly: `initialize`/`initialized` handshake, `tools/list`, `tools/call`.

**FR-8.2** — All tools have `name`, `description`, and `inputSchema` (JSON Schema) conforming to the MCP tool spec.

**FR-8.3** — Tool errors are returned as typed MCP error responses with `isError: true` and a structured payload: `{ error_code, message, retryable }`.

**FR-8.4** — Error codes: `TOKEN_EXPIRED`, `NOT_FOUND`, `RATE_LIMITED`, `TOOL_NOT_ENABLED`, `PERMISSION_DENIED`.

**FR-8.5** — The server connects via Streamable HTTP transport (`POST/GET/DELETE /mcp`) and is compatible with Claude Desktop and Cursor.

---

## Non-Functional Requirements

### NFR-1: Rate Limit Handling

**NFR-1.1** — The API client handles Basecamp's `429 Too Many Requests` response by inspecting the `Retry-After` header and waiting before retrying.

**NFR-1.2** — Exponential backoff with jitter is applied when `Retry-After` is absent.

**NFR-1.3** — Concurrent requests per user token are capped to prevent burst overrun.

---

### NFR-2: Pagination

**NFR-2.1** — All list tools parse the `Link: <url>; rel="next"` response header to detect additional pages.

**NFR-2.2** — All list tool responses include a pagination envelope: `{ items: [...], has_more: bool, next_page: int | null }`.

**NFR-2.3** — All list tools accept a `page` input parameter.

---

### NFR-3: Content Normalization

**NFR-3.1** — All rich-text content fields from Basecamp are converted from HTML to markdown before being returned in any tool response.

**NFR-3.2** — Basecamp-specific HTML tags are handled: `<bc-attachment>` → `[Attachment: {filename}]`, `<mention>` → `[@Name]`, `<bc-gallery>` → placeholder.

**NFR-3.3** — Raw HTML is never returned to an agent.

---

### NFR-4: Response Size

**NFR-4.1** — All list tool responses are capped at 100 items per call.

**NFR-4.2** — Total response payload per tool call does not exceed 50KB.

**NFR-4.3** — Document list returns truncated content (first 500 chars); full content only via `get_document`.

**NFR-4.4** — Attachment binary content is never fetched or returned.

---

### NFR-5: Security

**NFR-5.1** — The MCP server is read-only in v1. All non-GET HTTP methods to the Basecamp API are blocked at the API client layer.

**NFR-5.2** — `account_id` is always resolved from the authenticated user's token — never accepted as user input.

**NFR-5.3** — Per-user token isolation: one user's agent cannot access another user's Basecamp data.

**NFR-5.4** — The server runs over HTTPS in production.

---

### NFR-6: Compatibility

**NFR-6.1** — Compatible with Claude Desktop and Cursor via MCP Streamable HTTP transport.

**NFR-6.2** — A `TRANSPORT=stdio` environment flag enables single-user stdio mode for local development (reads token from env, no OAuth UI needed).

---

## Out of Scope (v1)

| Feature | Reason |
|---------|--------|
| Write operations (create docs, todos, messages) | Deferred to v2 — extra OAuth scope risk, significant complexity |
| Semantic search / RAG | Agent's responsibility; MCP is a context-provider only |
| Webhooks / push-based updates | Requires persistent event queue; polling sufficient for v1 |
| File attachment binary fetching / text extraction | Risk of memory exhaustion; metadata-only is sufficient |
| Multi-account (multi-org) support | One org (OpenXcell) is the target; no current use case for multi-org |
| External client access | Internal team only for v1 |
| Schedule / Calendar events | Lower priority; v2 scope |
| Write idempotency keys | v2 concern — no writes in v1 |

---

## Constraints

| Constraint | Detail |
|------------|--------|
| Basecamp API rate limit | 50 requests per 10 seconds per access token |
| Basecamp pagination | 15 items per page via `Link` header |
| Basecamp auth | OAuth 2.0 required — no personal access tokens for third-party apps |
| MCP transport | Streamable HTTP for multi-user; stdio for local dev only |
| Read-only enforcement | No non-GET Basecamp API calls in v1 |
| Response size | Hard cap at 100 items / 50KB per tool call |
| Campfire queries | Always bounded — `since` or `limit` required; default 24h |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FR-1.1 | Phase 1 | Complete |
| FR-1.2 | Phase 1 | Complete |
| FR-1.3 | Phase 1 | Complete |
| FR-1.4 | Phase 1 | Pending |
| FR-1.5 | Phase 1 | Pending |
| FR-1.6 | Phase 1 | Pending |
| FR-2.1 | Phase 3 | Pending |
| FR-2.2 | Phase 3 | Pending |
| FR-2.3 | Phase 3 | Pending |
| FR-2.4 | Phase 3 | Pending |
| FR-3.1 | Phase 3 | Pending |
| FR-3.2 | Phase 3 | Pending |
| FR-3.3 | Phase 3 | Pending |
| FR-3.4 | Phase 3 | Pending |
| FR-4.1 | Phase 3 | Pending |
| FR-4.2 | Phase 3 | Pending |
| FR-4.3 | Phase 3 | Pending |
| FR-4.4 | Phase 3 | Pending |
| FR-5.1 | Phase 3 | Pending |
| FR-5.2 | Phase 3 | Pending |
| FR-5.3 | Phase 3 | Pending |
| FR-6.1 | Phase 3 | Pending |
| FR-6.2 | Phase 3 | Pending |
| FR-6.3 | Phase 3 | Pending |
| FR-7.1 | Phase 3 | Pending |
| FR-7.2 | Phase 3 | Pending |
| FR-8.1 | Phase 3 | Pending |
| FR-8.2 | Phase 3 | Pending |
| FR-8.3 | Phase 3 | Pending |
| FR-8.4 | Phase 3 | Pending |
| FR-8.5 | Phase 4 | Pending |
| NFR-1.1 | Phase 2 | Pending |
| NFR-1.2 | Phase 2 | Pending |
| NFR-1.3 | Phase 2 | Pending |
| NFR-2.1 | Phase 2 | Pending |
| NFR-2.2 | Phase 2 | Pending |
| NFR-2.3 | Phase 2 | Pending |
| NFR-3.1 | Phase 2 | Pending |
| NFR-3.2 | Phase 2 | Pending |
| NFR-3.3 | Phase 2 | Pending |
| NFR-4.1 | Phase 2 | Pending |
| NFR-4.2 | Phase 2 | Pending |
| NFR-4.3 | Phase 2 | Pending |
| NFR-4.4 | Phase 2 | Pending |
| NFR-5.1 | Phase 2 | Pending |
| NFR-5.2 | Phase 2 | Pending |
| NFR-5.3 | Phase 2 | Pending |
| NFR-5.4 | Phase 5 | Pending |
| NFR-6.1 | Phase 4 | Pending |
| NFR-6.2 | Phase 4 | Pending |
