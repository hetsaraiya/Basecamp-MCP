import express from 'express';
import { startAuthFlow, handleCallback } from './auth/oauth.js';

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
    // Plan 01-02 will wire in TokenStore.save() here.
    // For now, confirm the flow works by returning the user info (not the tokens — never expose tokens in responses).
    res.json({
      message: 'OAuth complete',
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
