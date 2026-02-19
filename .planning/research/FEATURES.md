# Features: Basecamp MCP

*Researched: 2026-02-19*

## Table Stakes

Features an agent MUST have to use this MCP meaningfully. Without these, the server is not functional.

### 1. List All Projects

**Why it's table stakes:** Every subsequent tool call requires a `bucket_id`. Without enumerating projects and resolving a human-readable name to its numeric ID, an agent is blind. This is the root node of every operation.

**Endpoint:** `GET https://3.basecampapi.com/{account_id}/projects.json`

Returns project `id`, `name`, `description`, `status` (`active` | `archived` | `trashed`), and nested `dock` array listing which tools are enabled per project.

---

### 2. Fetch Message Board Threads

**Why it's table stakes:** Message threads are the primary async communication record — decisions, briefs, status updates, stakeholder feedback. An agent reasoning about project history cannot function without this.

**Endpoints:**
- `GET .../buckets/{bucket_id}/message_boards/{message_board_id}/messages.json`
- `GET .../buckets/{bucket_id}/messages/{message_id}.json`

`message_board_id` discovered from project `dock` (type: `"Message::Board"`).

---

### 3. Fetch To-Do Lists and Tasks

**Why it's table stakes:** To-dos record what needs doing, who's responsible, due dates, completion status, and threaded comments. An agent can't answer "what's pending?" or "what's overdue?" without this.

**Endpoints:**
- `GET .../buckets/{bucket_id}/todosets/{todoset_id}/todolists.json`
- `GET .../buckets/{bucket_id}/todolists/{todolist_id}/todos.json` (supports `?completed=true`)
- `GET .../buckets/{bucket_id}/todos/{todo_id}.json`

---

### 4. Fetch Documents

**Why it's table stakes:** Docs hold formal written artifacts: requirements, specs, meeting notes, design decisions, handoff documents. Highest-signal text content in any project.

**Endpoints:**
- `GET .../buckets/{bucket_id}/vaults/{vault_id}/documents.json`
- `GET .../buckets/{bucket_id}/documents/{document_id}.json`

---

### 5. Fetch Campfire (Chat) Lines

**Why it's table stakes:** Campfire captures informal decisions, quick questions, and ambient context that never makes it into formal docs. Essential for reconstructing recent activity.

**Endpoint:** `GET .../buckets/{bucket_id}/chats/{chat_id}/lines.json` — paginated, most recent first

---

### 6. Fetch File Attachment Metadata

**Why it's table stakes:** Projects accumulate file uploads (designs, spreadsheets, PDFs). An agent needs file names, uploaders, and download URLs to surface what's available.

**Endpoint:** `GET .../buckets/{bucket_id}/vaults/{vault_id}/attachments.json`

Returns `filename`, `byte_size`, `url`, `creator`, `created_at`.

---

### 7. OAuth 2.0 Authentication Flow

**Why it's table stakes:** Basecamp mandates OAuth 2.0 for all third-party apps. Must support per-user token model for multiple OpenXcell team members.

**Flow:**
- Authorization: `https://launchpad.37signals.com/authorization/new`
- Token exchange: `POST https://launchpad.37signals.com/authorization/token`
- Token refresh: `POST https://launchpad.37signals.com/authorization/token` (`grant_type=refresh_token`)
- Account discovery: `GET https://launchpad.37signals.com/authorization.json` → yields `account_id`

---

### 8. Rate Limit Handling (429 Backoff)

**Why it's table stakes:** Basecamp 3 returns `429 Too Many Requests` with `Retry-After` header. Without graceful backoff, the MCP will error mid-task unpredictably.

**Implementation:** Inspect `Retry-After` header; exponential backoff with jitter as fallback.

---

## Differentiators

Features that go beyond a basic API wrapper to make this genuinely more useful to AI agents.

### 1. Project Dock Introspection (Auto-Resolving Tool IDs)

A smart MCP resolves `message_board_id`, `todoset_id`, `vault_id`, `chat_id` automatically from the project ID — the agent only ever needs `project_id`.

- Cache the `dock` array per project ID (short TTL)
- Expose `get_project_tools` tool returning which tools are active with resolved IDs
- Return structured "tool not enabled" response when content type is absent

### 2. HTML-to-Markdown Stripping

Basecamp returns body content as HTML. Raw HTML wastes LLM context with angle brackets and noise.

- Strip server-side on all `content` and `description` fields
- Preserve structure: `<ul>/<li>` → markdown lists, `<strong>` → `**bold**`, `<a href>` → `[text](url)`

### 3. Pagination with `page` Parameter

Basecamp paginates at 15–20 items via `Link: <next>` headers. Without transparency, the agent silently receives only page 1.

- Parse `Link` headers to extract next URL
- Return envelope: `{ items: [...], has_more: bool, next_page: int | null }`
- Accept `page` input on all list tools

### 4. Normalized Metadata Envelopes

Consistent schema across all content types: `id`, `title`, `author` (name + email), `created_at`, `updated_at`, `url` (deeplink), `content` (plaintext). Type-specific extensions on top.

### 5. Project Scoping via Single `project_id`

`account_id` is fixed per authenticated user — derive it from OAuth response and store it. The agent only ever supplies `project_id`.

### 6. Active vs. Archived Project Filtering

`/projects.json` returns only active projects by default. Accept `status` param: `active` (default), `archived`, `all`.

### 7. To-Do Completion Filter

Accept `completed` param: `false` (default), `true`, `all`. Include `completed_at` timestamp on completed items.

### 8. Typed Error Responses

Schema: `{ error_code: string, message: string, retryable: bool }`
Codes: `TOKEN_EXPIRED`, `NOT_FOUND`, `RATE_LIMITED`, `TOOL_NOT_ENABLED`, `PERMISSION_DENIED`

---

## Anti-Features (v1)

| Feature | Why Excluded/Deferred |
|---------|----------------------|
| Write operations | Deferred to v2 — high risk, needs extra OAuth scopes |
| Semantic search / RAG / embeddings | Separate infrastructure problem; agent's context window is the retrieval layer |
| Webhooks / event streaming | Requires persistent server + event queue; polling sufficient for v1 |
| Bulk comment thread fetching on list calls | N+1 API calls → rate limit; fetch comments via detail endpoint on demand |
| Personal Access Token auth | Basecamp 3 doesn't support PATs for third-party apps — excluded permanently |
| Schedule / Calendar events | Lower priority than core content types; v2 scope |
| Bulk full-project dump tool | Slams rate limit; produces response too large for LLM context |
| Multi-account (multi-org) support | OpenXcell is one org; multi-account adds complexity with no current use case |

---

## API Coverage Map

| Content Type | Basecamp 3 Endpoint | MCP Tool Name |
|---|---|---|
| Projects | `GET /projects.json` | `list_projects` |
| Project Tools | Parsed from `dock[]` | `get_project_tools` |
| Messages | `GET /buckets/{id}/message_boards/{mb_id}/messages.json` | `list_messages` |
| Message Detail | `GET /buckets/{id}/messages/{msg_id}.json` | `get_message` |
| To-Do Lists | `GET /buckets/{id}/todosets/{todoset_id}/todolists.json` | `list_todolists` |
| To-Do Items | `GET /buckets/{id}/todolists/{list_id}/todos.json` | `list_todos` |
| To-Do Detail | `GET /buckets/{id}/todos/{todo_id}.json` | `get_todo` |
| Documents | `GET /buckets/{id}/vaults/{vault_id}/documents.json` | `list_documents` |
| Document Detail | `GET /buckets/{id}/documents/{doc_id}.json` | `get_document` |
| Campfire Lines | `GET /buckets/{id}/chats/{chat_id}/lines.json` | `list_campfire_lines` |
| File Attachments | `GET /buckets/{id}/vaults/{vault_id}/attachments.json` | `list_attachments` |

---

## Dependencies

```
Layer 0: Auth
└── OAuth 2.0 flow + token storage + account_id resolution

Layer 1: Project Discovery
└── list_projects → returns bucket IDs + dock (tool IDs)

Layer 2: Tool ID Resolution
└── get_project_tools → resolves message_board_id, todoset_id, vault_id, chat_id

Layer 3: List Tools (independent of each other)
├── list_messages
├── list_todolists
├── list_documents
├── list_campfire_lines
└── list_attachments

Layer 4: Detail Tools (each depends on its Layer 3 counterpart)
├── get_message
├── list_todos / get_todo
└── get_document
```

**Cross-cutting (build before Layer 3):**
- Rate limit handler
- HTML-to-markdown transformer
- Pagination envelope
- Typed error response schema
