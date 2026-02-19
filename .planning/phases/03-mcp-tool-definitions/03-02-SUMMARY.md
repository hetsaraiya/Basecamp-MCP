---
phase: 03-mcp-tool-definitions
plan: "02"
subsystem: api
tags: [mcp, modelcontextprotocol, stdio, zod, basecamp, tools, campfire, documents, attachments]

# Dependency graph
requires:
  - phase: 03-mcp-tool-definitions-plan-01
    provides: createTools() factory with 7 tools, McpServer, toolError/toolSuccess/classifyError, BasecampClient with all content-endpoint methods
  - phase: 02-api-client-infrastructure
    provides: listDocuments(), getDocument(), listCampfireLines(), listAttachments() on BasecampClient, DocumentSummarySchema, CampfireLineSchema, AttachmentSchema

provides:
  - "src/tools/tools.ts: createTools() factory extended to 11 tools (list_documents, get_document, list_campfire_lines, list_attachments added)"
  - "src/mcp.ts: Standalone stdio MCP entry point using StdioServerTransport, reads userId from BASECAMP_TEST_USER_ID env var"
  - "package.json: 'mcp' script — tsx src/mcp.ts for MCP Inspector testing"
  - "list_campfire_lines: defaults to last 24h when neither since nor limit specified (FR-6.2)"
  - "list_attachments: metadata-only mapping — filename, content_type, byte_size, download_url, creator, created_at (FR-7.2)"
  - "list_documents: uses DocumentSummarySchema — truncated content preview, truncated:true flag (FR-5.1)"
affects:
  - phase-04-transport-and-agent-integration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "StdioServerTransport entry point — BASECAMP_TEST_USER_ID env var for Phase 3 Inspector testing; Phase 4 replaces with per-session userId from HTTP URL path"
    - "Client-side since/limit filtering for list_campfire_lines — Basecamp API has no since param on chat lines endpoint"
    - "list_attachments metadata remapping — AttachmentSchema.title is filename; tool layer reverses mapping for agent clarity"

key-files:
  created:
    - src/mcp.ts
  modified:
    - src/tools/tools.ts
    - package.json

key-decisions:
  - "server.registerTool() used for all 4 new tools (consistent with existing 7 tools; not the deprecated server.tool() form)"
  - "list_campfire_lines effectiveSince defaults to Date.now() - 24h only when both since and limit are undefined — explicit limit with no since means 'most recent N', not time-filtered"
  - "list_attachments maps a.title back to filename in response — AttachmentSchema stores filename as title internally; tool output uses agent-friendly field name 'filename'"
  - "src/mcp.ts uses process.on('SIGINT') for clean shutdown — StdioServerTransport reads stdin, process must stay alive"

patterns-established:
  - "All 4 new tools follow identical handler pattern: tokenStore.get(userId) → new BasecampClient → client method → toolSuccess/classifyError"
  - "Client-side filtering after paginate() for campfire lines (since/limit) — same pattern as list_projects/list_todos"

requirements-completed: [FR-5.1, FR-5.2, FR-5.3, FR-6.1, FR-6.2, FR-6.3, FR-7.1, FR-7.2, FR-8.1, FR-8.2]

# Metrics
duration: 5min
completed: 2026-02-19
---

# Phase 3 Plan 02: MCP Tool Definitions Summary

**4 remaining tools (list_documents, get_document, list_campfire_lines, list_attachments) added to createTools() factory via server.registerTool(), plus StdioServerTransport stdio entry point in src/mcp.ts for MCP Inspector testing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-19T07:55:13Z
- **Completed:** 2026-02-19T08:00:00Z
- **Tasks:** 1 of 2 automated (Task 2 is human verification checkpoint)
- **Files modified:** 3

## Accomplishments

- Extended createTools() from 7 to 11 tools by adding list_documents, get_document, list_campfire_lines, list_attachments — all using server.registerTool() pattern consistent with existing tools
- Created src/mcp.ts stdio entry point: reads userId from BASECAMP_TEST_USER_ID, constructs createTools(userId, tokenStore), wires StdioServerTransport, exits cleanly on SIGINT
- list_campfire_lines implements FR-6.2 client-side: defaults to 24h window when neither since nor limit specified; applies since filter and limit slice after paginate()

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 4 remaining tools to createTools() and create src/mcp.ts** - `b247de0` (feat)
2. **Task 2: MCP Inspector verification** - awaiting human verification (checkpoint)

## Files Created/Modified

- `src/tools/tools.ts` - Added list_documents, get_document, list_campfire_lines, list_attachments via server.registerTool(); 11 total tools
- `src/mcp.ts` - StdioServerTransport entry point for MCP Inspector testing; BASECAMP_TEST_USER_ID env var; SIGINT handler
- `package.json` - Added "mcp": "tsx src/mcp.ts" script

## Decisions Made

- Used `server.registerTool()` for all 4 new tools (not `server.tool()`) — consistent with existing 7 tools and avoids deprecated API
- `list_campfire_lines` computes `effectiveSince` as `since ?? (limit == null ? 24h-ago : undefined)` — ensures explicit `limit` with no `since` means "most recent N" without applying a time filter
- `list_attachments` reverses the `title`->`filename` mapping in the tool response for agent clarity — `AttachmentSchema` uses `title` internally (normalized field); MCP output uses `filename`
- `src/mcp.ts` uses `process.on('SIGINT')` for graceful server close — required because StdioServerTransport keeps process alive reading stdin

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used server.registerTool() instead of plan's server.tool()**
- **Found during:** Task 1 (code review before implementation)
- **Issue:** Plan specified `server.tool()` but existing 7 tools all use `server.registerTool()` (the non-deprecated API); mixing would be inconsistent and `server.tool()` is deprecated in newer SDK versions
- **Fix:** Used `server.registerTool(name, { description, inputSchema }, callback)` for all 4 new tools, matching established pattern
- **Files modified:** src/tools/tools.ts
- **Verification:** tsc --noEmit: 0 errors; grep count confirms 11 registerTool() calls
- **Committed in:** b247de0 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - consistency/correctness fix)
**Impact on plan:** Essential for API consistency and avoiding deprecated method. No scope creep.

## Issues Encountered

None - TypeScript compiled clean on first attempt. All 11 tool registrations verified by grep.

## User Setup Required

**MCP Inspector verification requires real Basecamp OAuth token.** Steps for Task 2 checkpoint:
1. Run `npm run dev` and complete OAuth at http://localhost:3000/oauth/start
2. Find userId: `sqlite3 tokens.db "SELECT basecamp_user_id FROM tokens LIMIT 1;"`
3. Start MCP server: `BASECAMP_TEST_USER_ID=<id> npm run mcp`
4. Open MCP Inspector: `npx @modelcontextprotocol/inspector`

## Next Phase Readiness

- createTools() factory complete with all 11 tools — ready for Phase 4 transport wiring
- src/mcp.ts stdio entry point available for continued Inspector testing in Phase 4
- Phase 4 will create StreamableHTTPServerTransport entry point alongside this stdio one
- No blockers — pending only human MCP Inspector verification (Task 2 checkpoint)

## Self-Check: PASSED

- FOUND: src/tools/tools.ts
- FOUND: src/mcp.ts
- FOUND: package.json has "mcp" script
- FOUND commit: b247de0 (Task 1)
- tsc --noEmit: PASS (0 errors)
- server.registerTool() count: 11

---
*Phase: 03-mcp-tool-definitions*
*Completed: 2026-02-19*
