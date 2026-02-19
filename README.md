# Basecamp MCP

Use Basecamp directly from Claude Desktop, Cursor, or any MCP-compatible AI client.

---

## Setup (2 steps)

### 1. Authenticate

Open this URL in your browser:

```
https://mcp-basecamp.hetsaraiya.com/oauth/start
```

Sign in with your Basecamp account and approve access. You'll get back a JSON response like:

```json
{
  "message": "OAuth complete — paste your MCP URL into Claude Desktop or Cursor",
  "mcp_url": "https://mcp-basecamp.hetsaraiya.com/mcp/951835cc-0990-...",
  "user": { ... }
}
```

Copy the `mcp_url` value.

### 2. Add to your MCP client

Open (or create) your `mcp.json` and add:

```json
{
  "mcpServers": {
    "basecamp": {
      "url": "https://mcp-basecamp.hetsaraiya.com/mcp/951835cc-0990-..."
    }
  }
}
```

Replace the URL with your own `mcp_url` from step 1.

That's it — your AI client can now read and interact with your Basecamp projects.

---

## Available tools

| Tool | What it does |
|---|---|
| `list_projects` | List all accessible projects |
| `get_project_tools` | Show which tools are enabled in a project |
| `list_messages` | List messages on the message board |
| `get_message` | Get a single message with comments |
| `list_todolists` | List to-do lists in a project |
| `list_todos` | List to-dos in a list |
| `get_todo` | Get a single to-do with details |
| `list_documents` | List documents in the vault |
| `get_document` | Get a document's content |
| `list_campfire_lines` | Read Campfire chat messages |
| `list_attachments` | List file attachments in a project |

---

## Revoke access

Visit this URL (replace `<user_id>` with your Basecamp numeric user ID):

```
https://mcp-basecamp.hetsaraiya.com/oauth/revoke?user_id=<user_id>
```

This invalidates your token both locally and on Basecamp's side.
