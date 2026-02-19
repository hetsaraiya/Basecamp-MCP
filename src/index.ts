/**
 * src/index.ts — Main entry point for the Basecamp MCP server.
 *
 * Two modes controlled by TRANSPORT env var:
 *
 *   TRANSPORT=stdio (default for local single-user dev):
 *     Reads BASECAMP_USER_ID from env, creates tools for that user,
 *     connects StdioServerTransport. No OAuth flow needed.
 *     Same StdioServerTransport path as Phase 3 src/mcp.ts.
 *
 *   TRANSPORT unset or any other value (production):
 *     Starts Express HTTP server on PORT (default 3000).
 *     Serves /oauth/start, /oauth/callback, /oauth/revoke, /mcp/:userToken.
 *
 * NFR-6.2: TRANSPORT=stdio enables single-user stdio mode for local development.
 */

import 'dotenv/config';
import { tokenStore } from './auth/store.js';
import { createTools } from './tools/tools.js';

if (process.env.TRANSPORT === 'stdio') {
  // --- Stdio mode ---
  // Requires BASECAMP_USER_ID env var pointing to an already-stored token.
  // Use `npm run mcp` (which sets this) or supply manually.
  const userIdStr = process.env.BASECAMP_USER_ID;
  if (!userIdStr) {
    console.error('TRANSPORT=stdio requires BASECAMP_USER_ID env var. Set it to your Basecamp user ID.');
    process.exit(1);
  }
  const userId = Number(userIdStr);
  if (isNaN(userId)) {
    console.error('BASECAMP_USER_ID must be a numeric Basecamp user ID.');
    process.exit(1);
  }

  // Dynamic import to avoid loading StdioServerTransport in HTTP mode
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

  const server = createTools(userId, tokenStore);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep the process alive (StdioServerTransport reads from stdin until closed)
  console.error(`Basecamp MCP server running in stdio mode for user ${userId}`);
} else {
  // --- HTTP mode ---
  const { startServer } = await import('./server.js');
  startServer();
}
