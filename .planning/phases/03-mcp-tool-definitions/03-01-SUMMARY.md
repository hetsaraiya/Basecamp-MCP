---
phase: 03-mcp-tool-definitions
plan: "01"
subsystem: api
tags: [mcp, modelcontextprotocol, zod, basecamp, tools, errors]

# Dependency graph
requires:
  - phase: 02-api-client-infrastructure
    provides: BasecampClient with all content-endpoint methods, schema files, paginate(), htmlToMarkdown()
  - phase: 01-oauth-foundation
    provides: TokenStore class and TokenRecord type for per-user credential lookup

provides:
  - "@modelcontextprotocol/sdk ^1.26.0 installed"
  - "src/tools/errors.ts: toolError(), toolSuccess(), classifyError(), ToolErrorCode typed error envelope"
  - "src/tools/tools.ts: createTools(userId, tokenStore) factory returning McpServer with 7 registered tools"
  - "BasecampClient.getProject(projectId): dock array lookup for internal tool ID resolution"
  - "ProjectSchema extended with tools field (active dock tool names)"
  - "MessageSchema extended with replies_count field"
  - "TodoSchema extended with completed_at and comments_count fields"
  - "7 MCP tools: list_projects, get_project_tools, list_messages, get_message, list_todolists, list_todos, get_todo"
affects:
  - phase-04-transport-and-agent-integration
  - any consumer of createTools() factory

# Tech tracking
tech-stack:
  added: ["@modelcontextprotocol/sdk ^1.26.0 (satisfies >=^1.15.0 minimum for authInfo passthrough)"]
  patterns:
    - "createTools(userId, tokenStore) factory — per-session McpServer creation, Phase 4 binds per-user userId without tool-layer changes"
    - "toolError/toolSuccess/classifyError — structured MCP error envelope pattern; errors returned as successful MCP responses with isError: true"
    - "dock.find(d => d.name === 'message_board') — dock lookup by name field (NOT type), enables get_project_tools to resolve internal IDs without agent input"
    - "All tool handlers follow: tokenStore.get(userId) → BasecampClient → client method → toolSuccess/classifyError"

key-files:
  created:
    - src/tools/errors.ts
    - src/tools/tools.ts
  modified:
    - src/client/schemas/project.ts
    - src/client/schemas/message.ts
    - src/client/schemas/todo.ts
    - src/client/BasecampClient.ts
    - package.json
    - package-lock.json

key-decisions:
  - "@modelcontextprotocol/sdk resolved to ^1.26.0 (latest stable, satisfies ^1.15.0 minimum for authInfo passthrough in StreamableHTTPServerTransport)"
  - "All tool handlers use static top-level imports for htmlToMarkdown, MessageSchema, TodoSchema — no dynamic await import() calls"
  - "list_projects filters by status client-side (Basecamp API returns all statuses, filter applied after paginate())"
  - "list_todos filters by completed status client-side — single listTodos() call, then filter result.items"
  - "get_message and get_todo use client.get<Record<string,unknown>>() directly (single resource, no paginate)"

patterns-established:
  - "Tool handler pattern: validate input → tokenStore.get(userId) → new BasecampClient → call method → toolSuccess/classifyError"
  - "Error handling: classifyError() translates BasecampClient errors (RateLimitError, TokenExpiredError, HTTP 404/403) to typed ToolErrorCode responses"
  - "Dock ID resolution: getProject() + findDockItem() helper — resolves internal IDs without agent supplying them"

requirements-completed: [FR-2.1, FR-2.2, FR-2.3, FR-2.4, FR-3.1, FR-3.2, FR-3.3, FR-3.4, FR-4.1, FR-4.2, FR-4.3, FR-4.4, FR-8.1, FR-8.2, FR-8.3, FR-8.4]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 3 Plan 01: MCP Tool Definitions Summary

**7 MCP tools via createTools() factory using @modelcontextprotocol/sdk, typed error envelope (toolError/classifyError), and schema extensions for dock tools list, message reply counts, and todo completion timestamps**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T07:44:40Z
- **Completed:** 2026-02-19T07:48:15Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Installed @modelcontextprotocol/sdk ^1.26.0 and wired createTools() factory returning McpServer with 7 registered tools
- Created typed error module (toolError, toolSuccess, classifyError) enabling agents to distinguish retryable vs terminal errors via error_code
- Extended three schemas and updated BasecampClient field mappings to surface dock tool names, message reply counts, and todo completion timestamps that were previously silently discarded

## Task Commits

Each task was committed atomically:

1. **Task 1: Install MCP SDK, extend schemas, update field mappings, add getProject()** - `5439eff` (feat)
2. **Task 2: Create typed error module and createTools() factory with 7 tools** - `673ae4d` (feat)

## Files Created/Modified

- `src/tools/errors.ts` - Typed MCP error envelope: toolError(), toolSuccess(), classifyError(), ToolErrorCode type (FR-8.3, FR-8.4)
- `src/tools/tools.ts` - createTools(userId, tokenStore) factory registering 7 MCP tools on McpServer instance
- `src/client/schemas/project.ts` - Added tools field: z.array(z.string()).optional().default([]) (FR-2.3)
- `src/client/schemas/message.ts` - Added replies_count field: z.number().optional().default(0) (FR-3.4)
- `src/client/schemas/todo.ts` - Added completed_at and comments_count fields (FR-4.4)
- `src/client/BasecampClient.ts` - Updated listProjects() (dock→tools), listMessages() (comments_count→replies_count), listTodos() (completed_at, comments_count); added getProject() (FR-2.4)
- `package.json` - Added @modelcontextprotocol/sdk ^1.26.0 dependency
- `package-lock.json` - Lockfile updated

## Decisions Made

- @modelcontextprotocol/sdk resolved to ^1.26.0 (latest stable; satisfies ^1.15.0 minimum for authInfo passthrough in StreamableHTTPServerTransport for Phase 4)
- All tool handlers use static top-level imports for htmlToMarkdown, MessageSchema, TodoSchema — no dynamic await import() calls (avoids silently swallowing module errors in catch blocks)
- list_projects and list_todos filter results client-side after paginate() — Basecamp API returns all statuses/completion states mixed
- get_message and get_todo use client.get<>() directly (single resource fetch, no paginate wrapper needed)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compiled clean on first attempt after both tasks. All 7 tool registrations verified by grep.

## User Setup Required

None - no external service configuration required at this stage. Phase 4 will wire transport layer.

## Next Phase Readiness

- createTools() factory is ready for Phase 4 transport wiring (StreamableHTTPServerTransport or stdio)
- Phase 4 will call createTools(userId, tokenStore) once per session, passing per-session userId resolved from OAuth UUID route param
- No changes needed to tools.ts or errors.ts for Phase 4 — the factory pattern was designed for this
- No blockers

## Self-Check: PASSED

- FOUND: src/tools/errors.ts
- FOUND: src/tools/tools.ts
- FOUND: .planning/phases/03-mcp-tool-definitions/03-01-SUMMARY.md
- FOUND commit: 5439eff (Task 1)
- FOUND commit: 673ae4d (Task 2)
- tsc --noEmit: PASS (0 errors)
- server.tool() count: 7

---
*Phase: 03-mcp-tool-definitions*
*Completed: 2026-02-19*
