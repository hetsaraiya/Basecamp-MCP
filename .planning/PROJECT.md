# Basecamp MCP

## What This Is

A Model Context Protocol (MCP) server that exposes Basecamp project data to AI agents via on-demand tools. Team members at OpenXcell connect their AI agent (Claude, Cursor, etc.) to this MCP, specify a Basecamp project, and the agent can pull docs, messages, to-dos, campfire posts, and file attachments to reason over and act on. The MCP is a pure context-provider — what the agent does with the data depends entirely on who's using it.

## Core Value

Any AI agent can access the full context of a Basecamp project on demand, so it can act intelligently on real project knowledge — not guesses.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Agent can authenticate with Basecamp via OAuth (each team member uses their own account)
- [ ] Agent can list all projects the authenticated user has access to
- [ ] Agent can fetch all message board threads from a specified project
- [ ] Agent can fetch all campfire (chat) posts from a specified project
- [ ] Agent can fetch all to-do lists and tasks (with comments) from a specified project
- [ ] Agent can fetch all docs from a specified project
- [ ] Agent can fetch file attachment metadata and download URLs from a specified project
- [ ] Each content type is a separate MCP tool (on-demand, not bulk dump)
- [ ] MCP works with standard MCP-compatible agents (Claude Desktop, Cursor, etc.)

### Out of Scope

- Write operations (create docs, post messages, add todos) — deferred to v2
- External client access — internal OpenXcell team only for v1
- Semantic search / RAG over content — agent handles that layer, not the MCP
- Single-user personal access token auth — OAuth from the start for multi-user team use

## Context

- **Platform**: Basecamp 3 ([3.basecamp.com/3626692](https://3.basecamp.com/3626692)) — OpenXcell organization
- **Basecamp API**: Basecamp 3 REST API + OAuth 2.0, well-documented at github.com/basecamp/bc3-api
- **MCP protocol**: Anthropic's Model Context Protocol — defines how tools are exposed to agents
- **Team need**: Project managers and engineers want to point an agent at a client project and have it generate plans, requirements docs, summaries, etc. from real project history
- **Content richness**: Projects contain rich HTML docs, threaded message conversations, task hierarchies with comments, and Campfire chat logs — all valuable context for an agent

## Constraints

- **Auth**: OAuth 2.0 required — Basecamp mandates OAuth for third-party apps; no personal token shortcut
- **API rate limits**: Basecamp 3 API enforces rate limits — MCP must handle 429s gracefully
- **MCP spec**: Must conform to MCP tool schema — tools defined with JSON Schema input/output
- **Runtime**: Node.js (standard for MCP servers) or Python — to be decided in planning
- **Scope**: Read-only v1 — no write operations until v2

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| On-demand tools over bulk fetch | Agent calls only what it needs — avoids dumping massive context at once | — Pending |
| OAuth over personal token | Multi-user team use from day one; personal tokens don't scale to a team | — Pending |
| Read-only v1 | Shipping fast; write ops add significant complexity and risk | — Pending |

---
*Last updated: 2026-02-19 after initialization*
