import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { tokenStore } from './auth/store.js';
import { startAuthFlow, handleCallback, getTokenForUser } from './auth/oauth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createTools } from './tools/tools.js';

export const app = express();

app.get('/oauth/start', (_req, res) => {
  const redirectUri = process.env.BASECAMP_REDIRECT_URI!;
  const authUrl = startAuthFlow(redirectUri);
  res.redirect(authUrl);
});

app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send('Missing authorization code');
    return;
  }
  try {
    const tokenRecord = await handleCallback(code);
    tokenStore.save(tokenRecord);

    // Issue a stable UUID that becomes the user's personal MCP URL key.
    // Architecture decision (STATE.md 2026-02-19): unique URL per user, no Authorization header.
    const mcpToken = randomUUID();
    tokenStore.saveMcpToken(tokenRecord.basecampUserId, mcpToken);

    // Derive base URL for the MCP endpoint — strip the /oauth/callback path
    const redirectUri = process.env.BASECAMP_REDIRECT_URI ?? 'http://localhost:3000/oauth/callback';
    const baseUrl = redirectUri.replace(/\/oauth\/callback$/, '');
    const mcpUrl = `${baseUrl}/mcp/${mcpToken}`;

    res.json({
      message: 'OAuth complete — paste your MCP URL into Claude Desktop or Cursor',
      mcp_url: mcpUrl,
      user: {
        basecampUserId: tokenRecord.basecampUserId,
        email: tokenRecord.email,
        accountId: tokenRecord.accountId,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth callback failed';
    res.status(500).json({ error: message });
  }
});

app.get('/oauth/revoke', async (req, res) => {
  const userIdParam = req.query.user_id as string | undefined;
  const basecampUserId = Number(userIdParam);
  if (!userIdParam || isNaN(basecampUserId)) {
    res.status(400).json({ error: 'Missing or invalid user_id query param' });
    return;
  }

  const record = tokenStore.get(basecampUserId);
  if (!record) {
    res.status(404).json({ error: 'No token found for that user_id' });
    return;
  }

  // Call Basecamp's DELETE /authorization.json to revoke server-side
  // This invalidates the token in Basecamp's system
  try {
    const revokeRes = await fetch('https://launchpad.37signals.com/authorization.json', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${record.accessToken}`,
        'User-Agent': 'Basecamp MCP (internal@openxcell.com)',
      },
    });
    // 204 = success; 401 = already expired — either way remove locally
    if (!revokeRes.ok && revokeRes.status !== 401) {
      console.warn(`Basecamp revocation returned ${revokeRes.status} for user ${basecampUserId}`);
    }
  } catch (err) {
    // Network error during remote revocation — still remove locally
    console.warn('Remote revocation failed (network), removing local token:', err);
  }

  tokenStore.revoke(basecampUserId);
  res.json({ message: 'Token revoked', basecampUserId });
});

// ---------------------------------------------------------------------------
// Session management for Streamable HTTP transport
// ---------------------------------------------------------------------------

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  userId: number;
}

// Map from Mcp-Session-Id header value → active session
// Each session is bound to exactly one basecampUserId (via mcp_token lookup at initialization).
// Architecture decision (STATE.md 2026-02-19): session-map pattern, unique URL per user.
const sessions = new Map<string, Session>();

// ---------------------------------------------------------------------------
// POST /mcp/:userToken — initialize or continue an MCP session
// GET  /mcp/:userToken — SSE stream for server-sent events
// DELETE /mcp/:userToken — terminate session
// ---------------------------------------------------------------------------

app.use(express.json({ type: 'application/json' }));

app.all('/mcp/:userToken', async (req, res) => {
  const { userToken } = req.params;

  // Resolve the userToken to a TokenRecord — returns 401 if unknown
  const tokenRecord = tokenStore.getByMcpToken(userToken);
  if (!tokenRecord) {
    res.status(401).json({ error: 'Invalid or expired MCP token. Re-authenticate at /oauth/start' });
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // --- DELETE: terminate an existing session ---
  if (req.method === 'DELETE') {
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (session) {
        await session.transport.close();
        sessions.delete(sessionId);
      }
    }
    res.status(204).end();
    return;
  }

  // --- Existing session: route to established transport ---
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res, req.body);
    return;
  }

  // --- New session: initialize transport + tools for this user ---
  // This branch handles the MCP initialize request (first POST, no Mcp-Session-Id yet).
  // StreamableHTTPServerTransport generates the session ID via sessionIdGenerator.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId) => {
      // Bind the new session to this user's server instance.
      // onsessioninitialized fires synchronously before the response is sent,
      // so the session is in the Map before any tool calls can arrive.
      sessions.set(newSessionId, { transport, server, userId: tokenRecord.basecampUserId });
    },
  });

  // Create a fresh McpServer with tools bound to this user's basecampUserId.
  // createTools() is the Phase 3 factory — returns McpServer with all 11 tools.
  const server = createTools(tokenRecord.basecampUserId, tokenStore);

  // Connect the MCP server to the transport — must happen before handleRequest
  await server.connect(transport);

  // Register cleanup when transport closes (client disconnect, network drop, etc.)
  transport.onclose = () => {
    if (transport.sessionId) {
      sessions.delete(transport.sessionId);
    }
  };

  await transport.handleRequest(req, res, req.body);
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

export function startServer() {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`Basecamp MCP server listening on http://localhost:${port}`);
    console.log(`OAuth start: http://localhost:${port}/oauth/start`);
  });
}

// Only start the server when run directly (not when imported in tests)
if (process.argv[1] === new URL(import.meta.url).pathname) {
  startServer();
}

// Export getTokenForUser for downstream consumers (phases 2+)
export { getTokenForUser };
