import Database from 'better-sqlite3';
import type { TokenRecord } from './oauth.js';

// Per-user mutex: prevents duplicate concurrent refreshes for same user
const refreshMutexes = new Map<number, Promise<TokenRecord>>();

export class TokenExpiredError extends Error {
  readonly code = 'TOKEN_EXPIRED';
  readonly reAuthUrl: string;
  constructor(reAuthUrl: string) {
    super('Basecamp access token expired and refresh failed');
    this.name = 'TokenExpiredError';
    this.reAuthUrl = reAuthUrl;
  }
}

export class TokenStore {
  private db: Database.Database;

  constructor(dbPath: string = process.env.SQLITE_PATH ?? './tokens.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');  // Better concurrent read performance
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        basecamp_user_id INTEGER PRIMARY KEY,
        access_token     TEXT NOT NULL,
        refresh_token    TEXT NOT NULL,
        expires_at       INTEGER NOT NULL,
        account_id       TEXT NOT NULL,
        email            TEXT NOT NULL,
        created_at       INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
        updated_at       INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
      );
    `);
  }

  save(record: TokenRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO tokens (basecamp_user_id, access_token, refresh_token, expires_at, account_id, email, updated_at)
      VALUES (@basecampUserId, @accessToken, @refreshToken, @expiresAt, @accountId, @email, @updatedAt)
      ON CONFLICT(basecamp_user_id) DO UPDATE SET
        access_token  = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at    = excluded.expires_at,
        account_id    = excluded.account_id,
        email         = excluded.email,
        updated_at    = excluded.updated_at
    `);
    stmt.run({
      basecampUserId: record.basecampUserId,
      accessToken: record.accessToken,
      refreshToken: record.refreshToken,
      expiresAt: record.expiresAt.getTime(),
      accountId: record.accountId,
      email: record.email,
      updatedAt: Date.now(),
    });
  }

  get(basecampUserId: number): TokenRecord | null {
    const row = this.db.prepare(
      'SELECT * FROM tokens WHERE basecamp_user_id = ?'
    ).get(basecampUserId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToRecord(row);
  }

  revoke(basecampUserId: number): void {
    this.db.prepare('DELETE FROM tokens WHERE basecamp_user_id = ?').run(basecampUserId);
  }

  private rowToRecord(row: Record<string, unknown>): TokenRecord {
    return {
      accessToken: row.access_token as string,
      refreshToken: row.refresh_token as string,
      expiresAt: new Date(row.expires_at as number),
      accountId: row.account_id as string,
      basecampUserId: row.basecamp_user_id as number,
      email: row.email as string,
    };
  }
}

// Singleton — one store per process
export const tokenStore = new TokenStore();

export { refreshMutexes };
