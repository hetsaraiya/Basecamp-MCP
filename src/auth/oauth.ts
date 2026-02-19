import { AuthorizationCode } from 'simple-oauth2';

// TokenRecord — stored per user, keyed by basecampUserId in Plan 01-02
export interface TokenRecord {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  accountId: string;       // bc3 account_id from authorization.json
  basecampUserId: number;
  email: string;
}

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
  const tokenParams = { code, redirect_uri: process.env.BASECAMP_REDIRECT_URI! };
  const accessToken = await client.getToken(tokenParams);

  // 2. Compute expiresAt — default to 7200 seconds if expires_in is absent
  const expiresIn = (accessToken.token.expires_in as number | undefined) ?? 7200;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  // 3. Fetch identity to resolve account_id
  const identityRes = await fetch('https://launchpad.37signals.com/authorization.json', {
    headers: {
      'Authorization': `Bearer ${accessToken.token.access_token as string}`,
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

  // 5. Return TokenRecord — do NOT store here (TokenStore responsibility in Plan 01-02)
  return {
    accessToken: accessToken.token.access_token as string,
    refreshToken: accessToken.token.refresh_token as string,
    expiresAt,
    accountId: String(bc3Account.id),
    basecampUserId: identity.identity.id,
    email: identity.identity.email_address,
  };
}
