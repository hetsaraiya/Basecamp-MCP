# Pitfalls: Basecamp MCP

*Researched: 2026-02-19*

## Overview

18 pitfalls across 6 domains, specific to Basecamp 3 API + MCP server design. All must be addressed in Phase 1 except write idempotency (Phase 2).

---

## Domain 1: OAuth Token Management

### 1.1 — Storing tokens as flat env vars instead of per-user

**What goes wrong:** Treating the Basecamp OAuth token as a single server-side credential. Server ends up calling the API as one user for all users — permission bleed, wrong attribution.

**Warning signs:** Single `BASECAMP_ACCESS_TOKEN` in config; all tool calls return data from the same Basecamp account regardless of who triggered them.

**Prevention:** Per-user token store keyed by `account_id` + `identity_id`. Token store abstraction so backend can be swapped without touching auth logic.

**Phase:** 1 (auth architecture)

---

### 1.2 — No token refresh — relying on access tokens that expire

**What goes wrong:** Basecamp 3 access tokens expire (hours). Skip refresh handling and tools silently break the next day with 401 errors and no clear feedback.

**Warning signs:** Tools succeed immediately after auth but fail hours later; no `refresh_token` stored alongside `access_token`.

**Prevention:** Store both `access_token` and `refresh_token`. Wrap every Basecamp API call in a refresh interceptor: on 401, attempt one refresh, retry, then propagate structured error with re-auth URL if refresh also fails.

**Phase:** 1 (auth) — non-negotiable before any tool is stable

---

### 1.3 — Requesting overly broad OAuth scopes

**What goes wrong:** Basecamp 3 uses a single OAuth scope granting full account access. Write-capable tokens deployed in a v1 read-only phase creates unnecessary risk.

**Prevention:** Enforce read-only at the MCP server layer (block all non-GET HTTP methods in the API client) during v1. Document this explicitly.

**Phase:** 1 (auth) / 2 (write operations)

---

### 1.4 — No revocation or logout path

**What goes wrong:** Tokens for departed team members accumulate indefinitely. No way to offboard a user.

**Prevention:** Implement a token revocation endpoint calling Basecamp's `DELETE /authorization.json` and removing the local token record. Add TTL on token store records as safety net.

**Phase:** 1 — before production deployment

---

## Domain 2: Rate Limits & Pagination

### 2.1 — Ignoring the 50-requests-per-10-seconds rate limit

**What goes wrong:** Fanout patterns (fetch list → fetch every item concurrently) burst through Basecamp's rate limit immediately on any project with >5-10 items.

**Warning signs:** 429 errors on batch operations; no `Retry-After` header handling; errors surfaced raw to the AI agent.

**Prevention:** Rate-limit-aware HTTP client with: (a) exponential backoff on 429 respecting `Retry-After`, (b) request queue capping concurrent requests per user token. Cache project/bucket lists aggressively — they change infrequently.

**Phase:** 1 — build the HTTP client before writing any tool

---

### 2.2 — Not handling pagination — loading only the first page

**What goes wrong:** Basecamp paginates at 15 items per page via `Link: <url>; rel="next"` headers. Without following these, an agent summarizing "all open todos" silently sees only 15.

**Warning signs:** Tool responses for large projects always have exactly 15 items; no `Link` header parsing in the HTTP client.

**Prevention:** Parse `Link` headers on every list call. Return a structured envelope: `{ items: [...], has_more: bool, next_page: int | null }`. Accept `page` parameter on all list tools. Auto-paginate up to configurable max (default: 10 pages).

**Phase:** 1 — HTTP client layer before any tool is tested with real data

---

### 2.3 — Fetching entire project hierarchies in one call

**What goes wrong:** A `get_all_project_data` tool that pulls projects → buckets → todolists → todos is slow, burns rate limit, and overwhelms the agent's context window.

**Warning signs:** Tool response times over 10s; AI agents hitting context limits from a single call.

**Prevention:** Narrow, single-level tools: `list_projects`, `list_todos(project_id, todolist_id)`, `get_todo(todo_id)`. Let the AI agent orchestrate multi-step fetches. Hard to fix retroactively.

**Phase:** 1 — architectural decision made during tool design

---

## Domain 3: HTML Content

### 3.1 — Returning raw Basecamp HTML to AI agents

**What goes wrong:** Basecamp stores all rich-text (docs, messages, to-do descriptions, comments) as HTML. Raw HTML wastes context window tokens and degrades AI comprehension.

**Warning signs:** Tool responses contain `&amp;`, `<p>`, `<ul class="bc-attachment">` strings.

**Prevention:** HTML-to-markdown conversion in the response pipeline (not per-tool). Preserve structure: `<ul>/<li>` → markdown lists, `<strong>` → `**bold**`, `<a href>` → `[text](url)`, headings → `#/##`. Handle Basecamp-specific tags: `<bc-attachment>` → `[Attachment: filename.pdf]`, `<mention>` → `[@Name]`.

**Phase:** 1 — before any tool returns content to AI agents

---

### 3.2 — Losing attachment context when stripping HTML

**What goes wrong:** `<bc-attachment>` tags contain file references. Naive stripping removes them entirely — the agent is unaware a message contains a file.

**Prevention:** Parse `<bc-attachment>` tags specifically before stripping: extract `content-type`, `filename`, `url`. Render as `[Attachment: {filename} ({content-type})]` in markdown output.

**Phase:** 1 — part of the HTML conversion utility

---

## Domain 4: MCP Tool Design

### 4.1 — Too many tools with overlapping responsibilities

**What goes wrong:** 30+ granular tools (`get_todo`, `get_todo_details`, `get_todo_with_comments`) confuse AI agents. They waste turns selecting the right tool or pick the wrong one.

**Prevention:** Design tools around agent tasks, not API endpoints. Use `include_comments` or `detail_level` parameters on a single tool rather than separate tools per variant. Target 10–15 tools for v1.

**Phase:** 1 — review tool list before implementation begins

---

### 4.2 — Tool descriptions that don't guide the AI agent

**What goes wrong:** Vague descriptions like `"Get todos"` give no context about when to use the tool, required parameters, or response shape. Leads to wrong tool selection and malformed calls.

**Prevention:** Write descriptions like explaining to a smart but uninformed colleague — what it does, required parameters, response contents, caveats (e.g., "only returns first 15 items; use `page` for more"), example use case.

**Phase:** 1 — during tool specification, before implementation

---

### 4.3 — Not handling Basecamp's multi-account structure

**What goes wrong:** Every Basecamp 3 API URL requires `account_id`. Users can belong to multiple Basecamp orgs. Hardcoding one account ID breaks users in a different org.

**Warning signs:** `BASECAMP_ACCOUNT_ID` hardcoded in `.env`; 404 errors for users in a different org.

**Prevention:** Fetch available accounts from `https://launchpad.37signals.com/authorization.json` after OAuth and store alongside the token. If multiple accounts, expose account selection; if one, default to it. `account_id` is always internal — never surface it in tool schemas.

**Phase:** 1 (auth) — discovered during token storage design

---

### 4.4 — Returning raw API JSON instead of normalized schema

**What goes wrong:** Passing Basecamp's internal field naming (`bucket`, `sgid`, `inherits_status`) directly to the AI agent. When the API changes, the tool response changes too.

**Prevention:** Define a normalized response schema for each resource type mapping Basecamp fields to consistent, descriptive names. Strip irrelevant fields (`app_url`, `inherits_status`, `sgid`). Version the schema separately from the API client.

**Phase:** 1 — define schemas before implementation

---

### 4.5 — No idempotency for write operations

**What goes wrong:** AI agent retries or user re-runs create duplicate todos, messages, or comments in Basecamp.

**Prevention:** Accept optional `idempotency_key` on all create tools. Cache recent write results by key with short TTL (10 min); return cached result on duplicate key.

**Phase:** 2 (write operations) — required before any create/update tool is enabled

---

## Domain 5: Large Project Data

### 5.1 — No response size limits

**What goes wrong:** Projects with thousands of todos or large documents produce tool responses exceeding the AI agent's context window — silent truncation, hallucination, or hard errors.

**Warning signs:** Tool responses regularly exceed 50KB; AI agents stop referencing earlier parts of a response.

**Prevention:** Hard response limit per tool call (max 100 items or 50KB). `summary_mode` flag returning titles/dates/authors only. For docs and message bodies, return first 500 chars with `truncated: true` + a `get_document(doc_id)` tool for full content.

**Phase:** 1 — design constraint for all tools

---

### 5.2 — No caching layer, repeated identical API calls

**What goes wrong:** AI agents request the same resource multiple times in a conversation. Every call hits the Basecamp API — burns rate limit quota, adds latency.

**Prevention:** In-memory cache with TTLs per resource type:
- Projects/buckets: 5 min
- Todolists: 2 min
- Todos/messages: 1 min
- Campfire messages: 30 sec

Cache-aside pattern; log hit/miss rates.

**Phase:** 1 — implement alongside rate limit handling

---

### 5.3 — Fetching attachment binary content without size checks

**What goes wrong:** Tools that eagerly fetch attachment content download large files (PDFs, videos, archives), crash the server, or exhaust memory.

**Prevention:** Never fetch attachment binary content in a tool call — only return metadata (filename, content-type, byte_size, download_url). Check `byte_size` before any content fetch. Offer a separate `extract_attachment_text(attachment_id)` tool with explicit size limits (refuse > 10MB).

**Phase:** 1 — attachment tools must include size guard from first implementation

---

## Domain 6: Campfire Chat

### 6.1 — No time bounds on campfire queries

**What goes wrong:** Campfire has high message volume. Fetching "all messages" without a time bound burns rate limit and returns stale context to the agent.

**Prevention:** Always require `since` timestamp or `limit` parameter; default to last 24 hours if unspecified. Document this in the tool description. No real-time streaming in v1.

**Phase:** 1 — enforced in campfire tool specification before implementation

---

## Phase Mapping Summary

| Pitfall | Domain | Phase |
|---------|--------|-------|
| 1.1 Per-user token store | OAuth | 1 |
| 1.2 Token refresh | OAuth | 1 |
| 1.3 Minimal scopes | OAuth | 1/2 |
| 1.4 Token revocation | OAuth | 1 |
| 2.1 Rate limit handling | API Client | 1 |
| 2.2 Pagination | API Client | 1 |
| 2.3 On-demand fetching | Tool Design | 1 |
| 3.1 HTML stripping | Content | 1 |
| 3.2 Attachment context | Content | 1 |
| 4.1 Tool count | MCP Design | 1 |
| 4.2 Tool descriptions | MCP Design | 1 |
| 4.3 Multi-account | OAuth/MCP | 1 |
| 4.4 Normalized schema | MCP Design | 1 |
| 4.5 Write idempotency | MCP Design | 2 |
| 5.1 Response size limits | Data | 1 |
| 5.2 Caching | Data | 1 |
| 5.3 Attachment size checks | Data | 1 |
| 6.1 Campfire time bounds | Campfire | 1 |

## Critical — Must Address Before Any Tool Is Exposed to Agents

1. Per-user OAuth token store with refresh token support (1.1, 1.2)
2. Rate-limit-aware HTTP client with backoff (2.1)
3. Pagination handling on all list endpoints (2.2)
4. HTML-to-markdown conversion pipeline (3.1, 3.2)
5. Response size limits in the tool response pipeline (5.1)
