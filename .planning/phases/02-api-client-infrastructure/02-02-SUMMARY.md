---
phase: 02-api-client-infrastructure
plan: "02"
subsystem: api
tags: [zod, node-html-parser, pagination, html-to-markdown, basecamp, typescript, esm]

# Dependency graph
requires:
  - phase: 02-api-client-infrastructure
    plan: "01"
    provides: BasecampClient with getRaw() returning full Response<unknown> including Link headers; withRateLimit() and concurrency semaphore transparent to content layer

provides:
  - paginate<T>() function reading RFC 5988 Link headers for has_more/next_page, 100-item cap (NFR-4.1), 50KB payload cap (NFR-4.2)
  - PaginatedResult<T> interface — { items, has_more, next_page } envelope for all list calls
  - htmlToMarkdown() converting HTML + bc-attachment/mention/bc-gallery Basecamp tags to Markdown (NFR-3.1, 3.2, 3.3)
  - ProjectSchema, MessageSchema, TodoSchema, TodoListSchema, DocumentSchema, DocumentSummarySchema, CampfireLineSchema, AttachmentSchema
  - schemas/index.ts re-exporting all 6 content-type schemas
  - BasecampClient extended with 7 endpoint methods: listProjects, listMessages, listTodoLists, listTodos, listDocuments, getDocument, listCampfireLines, listAttachments
affects: [03-mcp-tools, 05-testing]

# Tech tracking
tech-stack:
  added: [zod@3 (runtime schema validation and TypeScript inference), node-html-parser (lightweight DOM tree for HTML→Markdown single-pass conversion)]
  patterns:
    - paginate<T>() transform callback — schema parse happens inside callback, paginate() is type-generic
    - DocumentSummarySchema extends DocumentSchema with .transform() for content truncation
    - htmlToMarkdown() single-pass recursive node traversal — no regex on raw HTML string
    - Safety-net regex strip after DOM traversal guarantees no angle brackets in output (NFR-3.3)
    - normalizeEnvelopeFields() private helper reduces field mapping repetition across 7 endpoint methods

key-files:
  created:
    - src/client/paginate.ts
    - src/client/html-to-markdown.ts
    - src/client/schemas/project.ts
    - src/client/schemas/message.ts
    - src/client/schemas/todo.ts
    - src/client/schemas/document.ts
    - src/client/schemas/campfire.ts
    - src/client/schemas/attachment.ts
    - src/client/schemas/index.ts
  modified:
    - src/client/BasecampClient.ts (7 endpoint methods added)
    - package.json (zod, node-html-parser added)
    - package-lock.json

key-decisions:
  - "node-html-parser chosen over turndown/marked — lightweight, ESM-compatible, handles Basecamp custom tags (bc-attachment, mention, bc-gallery) naturally via tagName switch"
  - "paginate<T>() takes transform callback — schema parse inside callback keeps paginate generic; callers own normalization logic"
  - "DocumentSummarySchema extends DocumentSchema with .transform() rather than a separate schema — one source of truth for Document shape"
  - "50KB payload cap uses pop loop (slice) not binary search — simpler, deterministic, and response items rarely exceed 50KB total"
  - "AttachmentSchema content field hardcoded to '' in every endpoint call, not derived from raw data — ensures no accidental binary data path"
  - "Campfire lines have no title field in Basecamp API — CampfireLineSchema uses default '' for title to maintain envelope conformance"

patterns-established:
  - "All list calls return PaginatedResult<T> — tools never receive raw arrays, always { items, has_more, next_page }"
  - "All rich-text HTML fields pass through htmlToMarkdown() before schema.parse() — no HTML escapes the content layer"
  - "Field name mapping is explicit in each endpoint method, not done inside schema transforms — easier to trace raw→normalized field paths"
  - "Schema files are self-contained (no shared AuthorSchema import) — no circular dependency risk across schema files"

requirements-completed: [NFR-2.1, NFR-2.2, NFR-2.3, NFR-3.1, NFR-3.2, NFR-3.3, NFR-4.1, NFR-4.2, NFR-4.3, NFR-4.4]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 2 Plan 02: Content Layer Summary

**Pagination envelope with Link-header parsing, HTML-to-Markdown converter for Basecamp custom tags, zod schemas for 6 content types, and 7 endpoint methods on BasecampClient returning PaginatedResult<T> with 100-item and 50KB caps**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T05:44:37Z
- **Completed:** 2026-02-19T05:48:38Z
- **Tasks:** 2
- **Files modified:** 12 (9 created + BasecampClient.ts + package.json + package-lock.json)

## Accomplishments

- `src/client/paginate.ts` — `paginate<T>()` with RFC 5988 Link header parsing, 100-item cap (NFR-4.1), 50KB payload cap with graceful tail trim (NFR-4.2), page param forwarding (NFR-2.3)
- `src/client/html-to-markdown.ts` — `htmlToMarkdown()` with single-pass DOM traversal: standard HTML → Markdown + bc-attachment, mention, bc-gallery Basecamp tags → readable references (NFR-3.1, 3.2, 3.3)
- 6 zod schema files + `schemas/index.ts` re-export barrel; `DocumentSummarySchema` truncates content to 500 chars (NFR-4.3); `AttachmentSchema` enforces empty `content` (NFR-4.4)
- `BasecampClient` extended with 7 typed endpoint methods; all field name mappings explicit (name→title, app_url→url, creator→author, subject→title, filename→title, content→title for todos)

## Task Commits

Each task was committed atomically:

1. **Task 1: Pagination envelope and HTML-to-markdown pipeline** - `a5eda61` (feat)
2. **Task 2: Zod schemas for all 6 content types and BasecampClient endpoint methods** - `3ae5786` (feat)

## Endpoint Method Signatures

Phase 3 MCP tools call these methods directly:

```typescript
// Projects — no bucket context
listProjects(page?: number): Promise<PaginatedResult<Project>>

// Messages — requires bucket_id + message_board_id (from dock lookup in Phase 3)
listMessages(bucketId: number, boardId: number, page?: number): Promise<PaginatedResult<Message>>

// Todo lists and individual todos
listTodoLists(bucketId: number, todoSetId: number, page?: number): Promise<PaginatedResult<TodoList>>
listTodos(bucketId: number, todoListId: number, page?: number): Promise<PaginatedResult<Todo>>

// Documents — summary list (500-char truncated) and full single fetch
listDocuments(bucketId: number, vaultId: number, page?: number): Promise<PaginatedResult<DocumentSummary>>
getDocument(bucketId: number, documentId: number): Promise<Document>

// Campfire chat lines
listCampfireLines(bucketId: number, chatId: number, page?: number): Promise<PaginatedResult<CampfireLine>>

// Attachments — metadata only, never binary (NFR-4.4)
listAttachments(bucketId: number, vaultId: number, page?: number): Promise<PaginatedResult<Attachment>>
```

## PaginatedResult<T> Interface

```typescript
export interface PaginatedResult<T> {
  items: T[];
  has_more: boolean;   // true if Link header had rel="next" OR items were dropped for size limit
  next_page: number | null;  // page number extracted from Link header URL, null if no next page
}
```

## Field Name Mapping Table

| Content type | raw title field | raw content field | raw url field | raw author field |
|---|---|---|---|---|
| Project | `name` | `description` (plain) | `app_url` | `creator` |
| Message | `subject` | `content` (HTML) | `app_url` | `creator` |
| TodoList | `name` | `description` (HTML) | `app_url` | `creator` |
| Todo | `content` (the title text) | `description` (HTML notes) | `app_url` | `creator` |
| Document | `title` | `content` (HTML) | `app_url` | `creator` |
| CampfireLine | (empty — no title field) | `content` (HTML) | `app_url` | `creator` |
| Attachment | `filename` | (always empty) | `app_url` | `creator` |

## htmlToMarkdown Conversion Rules

Standard HTML (NFR-3.1): `<strong>`/`<b>` → `**text**`, `<em>`/`<i>` → `*text*`, `<a>` → `[text](url)`, `<h1-3>` → `#/##/###`, `<ul><li>` → `- item`, `<ol><li>` → `1. item`, `<p>` → `text\n\n`, `<br>` → `\n`, `<code>` → backtick, `<pre>` → triple backtick, `<blockquote>` → `> text`, `<hr>` → `---`

Basecamp-specific (NFR-3.2):
- `<bc-attachment filename="f" content-type="t">` → `[Attachment: f (t)]`
- `<mention>Name</mention>` → `[@Name]`
- `<bc-gallery>` → `[Gallery]`

Safety net (NFR-3.3): Final regex `/<[^>]+>/g` → `''` strips any residual angle brackets.

## Files Created/Modified

- `src/client/paginate.ts` — exports `paginate<T>()` and `PaginatedResult<T>` interface
- `src/client/html-to-markdown.ts` — exports `htmlToMarkdown(html: string | null | undefined): string`
- `src/client/schemas/project.ts` — `ProjectSchema`, `Project`
- `src/client/schemas/message.ts` — `MessageSchema`, `Message`
- `src/client/schemas/todo.ts` — `TodoSchema`, `Todo`, `TodoListSchema`, `TodoList`
- `src/client/schemas/document.ts` — `DocumentSchema`, `Document`, `DocumentSummarySchema`, `DocumentSummary`
- `src/client/schemas/campfire.ts` — `CampfireLineSchema`, `CampfireLine`
- `src/client/schemas/attachment.ts` — `AttachmentSchema`, `Attachment`
- `src/client/schemas/index.ts` — re-exports all schemas and types
- `src/client/BasecampClient.ts` — extended with 7 public endpoint methods + `normalizeEnvelopeFields()` private helper
- `package.json` — `zod` and `node-html-parser` added as production dependencies

## Decisions Made

- **node-html-parser over turndown/marked**: node-html-parser gives direct DOM access needed to handle Basecamp's `<bc-attachment>`, `<mention>`, `<bc-gallery>` custom tags. turndown/marked don't know these tags natively.
- **paginate<T>() transform callback pattern**: Schema parse lives in the transform callback inside each endpoint method. This keeps `paginate()` fully generic and puts field-mapping logic next to the field-mapping table, making it easy to verify against the raw Basecamp API.
- **DocumentSummarySchema extends DocumentSchema**: One canonical Document shape; the summary variant just adds a `.transform()` on the content field. No duplication of field definitions.
- **Attachment content hardcoded to '' at call site**: The empty string is set in `listAttachments()` before calling schema parse, not inside the schema. This makes it impossible for any raw Basecamp binary content field to accidentally reach the schema and be passed through.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — TypeScript compiled clean on first attempt. All inline verification tests passed on first run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 7 endpoint methods are importable via `BasecampClient` and return fully typed `PaginatedResult<T>` or single `T`
- Phase 3 MCP tools call `listProjects()`, `listMessages()`, etc. directly — no additional abstraction needed
- Phase 3 will need to look up dock item IDs (message_board_id, todoset_id, vault_id, chat_id) from project dock — these are parameters to the endpoint methods; Phase 3 handles the two-step lookup
- TypeScript compiles zero errors; zod runtime validation is in place for every endpoint
- `htmlToMarkdown` conversion rules documented above — Phase 5 test suite should cover the same cases

---
*Phase: 02-api-client-infrastructure*
*Completed: 2026-02-19*

## Self-Check: PASSED

- FOUND: src/client/paginate.ts
- FOUND: src/client/html-to-markdown.ts
- FOUND: src/client/schemas/project.ts
- FOUND: src/client/schemas/message.ts
- FOUND: src/client/schemas/todo.ts
- FOUND: src/client/schemas/document.ts
- FOUND: src/client/schemas/campfire.ts
- FOUND: src/client/schemas/attachment.ts
- FOUND: src/client/schemas/index.ts
- FOUND: .planning/phases/02-api-client-infrastructure/02-02-SUMMARY.md
- FOUND commit: a5eda61 (Task 1)
- FOUND commit: 3ae5786 (Task 2)
