import { WrongKeyError, type Db } from '@finapp/db';
import { randomBytes, timingSafeEqual } from 'node:crypto';

/** How the vault reaches the encrypted store; swapped for an in-memory store in tests. */
export interface StoreAccess {
  exists(): boolean;
  create(passphrase: string): Promise<Db>;
  open(passphrase: string): Promise<Db>;
}

export interface Credentials {
  readonly sessionToken: string;
  readonly csrfToken: string;
}

export type LoginOutcome =
  | { readonly kind: 'ok'; readonly credentials: Credentials }
  | { readonly kind: 'wrong_passphrase' }
  | { readonly kind: 'throttled'; readonly retryAfterMs: number };

const FREE_ATTEMPTS = 5;
const MAX_BLOCK_MS = 30 * 60_000;

const token = () => randomBytes(32).toString('base64url');

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Single-user session state. Unlocked means the database is open in memory; logging out, an idle
 * timeout or a restart locks it again. Only one browser session exists at a time.
 */
export class Vault {
  private db: Db | null = null;
  private session: (Credentials & { lastSeenMs: number }) | null = null;
  private failures = 0;
  private blockedUntilMs = 0;

  constructor(
    private readonly store: StoreAccess,
    private readonly nowMs: () => number,
    private readonly idleTimeoutMs = 15 * 60_000,
  ) {}

  state(): 'uninitialized' | 'locked' | 'unlocked' {
    if (this.db) return 'unlocked';
    return this.store.exists() ? 'locked' : 'uninitialized';
  }

  /** Creates the store; `prepare` runs once on the new database (e.g. to load demo data). */
  async setup(passphrase: string, prepare: (db: Db) => void): Promise<Credentials> {
    if (this.store.exists()) throw new Error('Store already exists');
    const db = await this.store.create(passphrase);
    prepare(db);
    return this.unlock(db);
  }

  async login(passphrase: string): Promise<LoginOutcome> {
    const now = this.nowMs();
    if (now < this.blockedUntilMs)
      return { kind: 'throttled', retryAfterMs: this.blockedUntilMs - now };
    let db: Db;
    try {
      db = await this.store.open(passphrase);
    } catch (error) {
      if (!(error instanceof WrongKeyError)) throw error;
      this.failures += 1;
      if (this.failures >= FREE_ATTEMPTS) {
        const blockMs = Math.min(MAX_BLOCK_MS, 30_000 * 2 ** (this.failures - FREE_ATTEMPTS));
        this.blockedUntilMs = this.nowMs() + blockMs;
      }
      return { kind: 'wrong_passphrase' };
    }
    this.failures = 0;
    this.blockedUntilMs = 0;
    if (this.db) {
      db.close(); // already unlocked: the passphrase was only verified; rotate the session
      return { kind: 'ok', credentials: this.newSession() };
    }
    return { kind: 'ok', credentials: this.unlock(db) };
  }

  lock(): void {
    this.db?.close();
    this.db = null;
    this.session = null;
  }

  /** The open database for a valid, non-idle session token; locks on idle timeout. */
  authenticate(sessionToken: string | undefined): Db | null {
    if (!this.db || !this.session || !sessionToken) return null;
    if (!sameToken(sessionToken, this.session.sessionToken)) return null;
    const now = this.nowMs();
    if (now - this.session.lastSeenMs > this.idleTimeoutMs) {
      this.lock();
      return null;
    }
    this.session.lastSeenMs = now;
    return this.db;
  }

  csrfMatches(csrfToken: string | undefined): boolean {
    return !!this.session && !!csrfToken && sameToken(csrfToken, this.session.csrfToken);
  }

  /** The CSRF token for the holder of `sessionToken`, so a reloaded page can keep working. */
  csrfFor(sessionToken: string | undefined): string | undefined {
    return this.authenticate(sessionToken) ? this.session?.csrfToken : undefined;
  }

  private unlock(db: Db): Credentials {
    this.db = db;
    return this.newSession();
  }

  private newSession(): Credentials {
    const credentials = { sessionToken: token(), csrfToken: token() };
    this.session = { ...credentials, lastSeenMs: this.nowMs() };
    return credentials;
  }
}
