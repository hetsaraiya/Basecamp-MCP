/**
 * mcp.ts — Standalone MCP server entry point using StdioServerTransport.
 *
 * Phase 3 usage: MCP Inspector testing.
 *   npx tsx src/mcp.ts
 *
 * Reads userId from BASECAMP_TEST_USER_ID env var (integer).
 * Phase 4 will replace this with per-session userId from the HTTP URL path.
 *
 * Architecture decision (STATE.md 2026-02-19):
 *   StdioServerTransport for Phase 3 (Inspector testing).
 *   StreamableHTTPServerTransport is Phase 4 concern.
 *
 * SDK version decision (STATE.md 2026-02-19):
 *   @modelcontextprotocol/sdk ^1.15.0 required (not ^1.6.x from stale ROADMAP stack line).
 */

import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { tokenStore } from './auth/store.js';
import { createTools } from './tools/tools.js';

async function main() {
  const userIdEnv = process.env['BASECAMP_TEST_USER_ID'];
  if (!userIdEnv) {
    console.error(
      'Error: BASECAMP_TEST_USER_ID environment variable is required.\n' +
      'Set it to your Basecamp user ID from the tokens.db:\n' +
      '  sqlite3 tokens.db "SELECT basecamp_user_id FROM tokens LIMIT 1;"\n' +
      'Then run:\n' +
      '  BASECAMP_TEST_USER_ID=<id> npx tsx src/mcp.ts'
    );
    process.exit(1);
  }

  const userId = parseInt(userIdEnv, 10);
  if (isNaN(userId)) {
    console.error(`Error: BASECAMP_TEST_USER_ID must be an integer. Got: "${userIdEnv}"`);
    process.exit(1);
  }

  const server = createTools(userId, tokenStore);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep process alive — stdio transport reads from stdin
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('MCP server failed to start:', error);
  process.exit(1);
});
