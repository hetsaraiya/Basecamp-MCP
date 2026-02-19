import { AuthorizationCode } from 'simple-oauth2';
import { tokenStore, refreshMutexes, TokenExpiredError } from './store.js';

// TokenRecord — stored per user, keyed by basecampUserId in Plan 01-02
export interface TokenRecord {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  accountId: string;       // bc3 account_id from authorization.json
  basecampUserId: number;
  email: string;
}

// Re-export TokenExpiredError so callers can import from oauth.ts
export { TokenExpiredError };

interface BasecampIdentity {
  expires_at: string;
  identity: {
    id: number;
    email_address: string;
    first_name: string;
    last_name: string;
  };
  accounts: Array<{
    product: string;   // "bc3" for Basecamp 3
    id: number;
    name: string;
    href: string;
  }>;
}

const client = new AuthorizationCode({
  client: {
    id: process.env.BASECAMP_CLIENT_ID!,
    secret: process.env.BASECAMP_CLIENT_SECRET!,
  },
  auth: {
    tokenHost: 'https://launchpad.37signals.com',
    tokenPath: '/authorization/token',
    authorizePath: '/authorization/new',
  },
});

// How many milliseconds before expiry to proactively refresh (5 minutes)
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// The re-auth URL shown to callers when refresh fails
const REAUTH_URL = `http://localhost:${process.env.PORT ?? 3000}/oauth/start`;

export function startAuthFlow(redirectUri: string): string {
  // Cast to unknown then back to allow Basecamp-specific `type` param
  // (@types/simple-oauth2 doesn't include it, but the library passes it through)
  return client.authorizeURL({
    redirect_uri: redirectUri,
    type: 'web_server',   // Basecamp requires this param
  } as unknown as Parameters<typeof client.authorizeURL>[0]);
}

export async function handleCallback(code: string): Promise<TokenRecord> {
  // 1. Exchange code for tokens
  // Basecamp Launchpad expects all params as query string (same as refresh flow).
  // simple-oauth2's client.getToken() sends credentials via Basic Auth header — 400s.
  const tokenParams = new URLSearchParams({
    type: 'web_server',
    client_id: process.env.BASECAMP_CLIENT_ID!,
    client_secret: process.env.BASECAMP_CLIENT_SECRET!,
    redirect_uri: process.env.BASECAMP_REDIRECT_URI!,
    code,
  });
  const tokenRes = await fetch(
    `https://launchpad.37signals.com/authorization/token?${tokenParams.toString()}`,
    { method: 'POST' },
  );
  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '');
    throw new Error(`Token exchange failed: ${tokenRes.status} ${tokenRes.statusText} — ${body}`);
  }
  const tokenData = await tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  };

  // 2. Compute expiresAt — default to 7200 seconds if expires_in is absent
  const expiresIn = tokenData.expires_in ?? 7200;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  // 3. Fetch identity to resolve account_id
  const identityRes = await fetch('https://launchpad.37signals.com/authorization.json', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'User-Agent': 'Basecamp MCP (internal@openxcell.com)',
    },
  });

  if (!identityRes.ok) {
    throw new Error(`Failed to fetch Basecamp identity: ${identityRes.status} ${identityRes.statusText}`);
  }

  const identity = await identityRes.json() as BasecampIdentity;

  // 4. Filter accounts for bc3
  const bc3Accounts = identity.accounts.filter(a => a.product === 'bc3');

  if (bc3Accounts.length === 0) {
    throw new Error('No Basecamp 3 account found for this user');
  }

  // Use first bc3 account (single-org team for v1; multi-account out of scope per PROJECT.md)
  const bc3Account = bc3Accounts[0];

  // 5. Return TokenRecord — storage handled by TokenStore (wired in server.ts)
  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt,
    accountId: String(bc3Account.id),
    basecampUserId: identity.identity.id,
    email: identity.identity.email_address,
  };
}

export async function getTokenForUser(basecampUserId: number): Promise<TokenRecord> {
  const record = tokenStore.get(basecampUserId);
  if (!record) {
    throw new TokenExpiredError(REAUTH_URL);
  }

  // Token still valid with buffer — return immediately
  if (record.expiresAt.getTime() - Date.now() > REFRESH_BUFFER_MS) {
    return record;
  }

  // Token expiring — use per-user mutex to prevent duplicate refresh calls
  const existing = refreshMutexes.get(basecampUserId);
  if (existing) {
    return existing;
  }

  const refreshPromise = refreshTokenForUser(record).finally(() => {
    refreshMutexes.delete(basecampUserId);
  });
  refreshMutexes.set(basecampUserId, refreshPromise);
  return refreshPromise;
}

async function refreshTokenForUser(record: TokenRecord): Promise<TokenRecord> {
  // Basecamp token refresh: POST with type=refresh query param
  // URL: https://launchpad.37signals.com/authorization/token?type=refresh&refresh_token=<token>&client_id=<id>&client_secret=<secret>
  const params = new URLSearchParams({
    type: 'refresh',
    refresh_token: record.refreshToken,
    client_id: process.env.BASECAMP_CLIENT_ID!,
    client_secret: process.env.BASECAMP_CLIENT_SECRET!,
  });

  let refreshRes: Response;
  try {
    refreshRes = await fetch(
      `https://launchpad.37signals.com/authorization/token?${params.toString()}`,
      { method: 'POST' }
    );
  } catch {
    throw new TokenExpiredError(REAUTH_URL);
  }

  if (!refreshRes.ok) {
    // Refresh failed (e.g., refresh_token revoked) — surface TOKEN_EXPIRED
    throw new TokenExpiredError(REAUTH_URL);
  }

  const body = await refreshRes.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const refreshed: TokenRecord = {
    ...record,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,   // Basecamp rotates refresh tokens
    expiresAt: new Date(Date.now() + (body.expires_in ?? 7200) * 1000),
  };

  tokenStore.save(refreshed);  // Atomic upsert — both tokens updated together
  return refreshed;
}
