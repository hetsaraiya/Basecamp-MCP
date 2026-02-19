import 'dotenv/config';
import express from 'express';
import { tokenStore } from './auth/store.js';
import { startAuthFlow, handleCallback, getTokenForUser } from './auth/oauth.js';

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
    tokenStore.save(tokenRecord);   // Persist to SQLite
    res.json({
      message: 'OAuth complete — token stored',
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
