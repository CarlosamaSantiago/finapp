import Database from 'better-sqlite3-multiple-ciphers';

export type Db = Database.Database;

/** The passphrase-derived key cannot decrypt the file (wrong passphrase or not our database). */
export class WrongKeyError extends Error {
  constructor() {
    super('Database key is wrong or the file is not an encrypted finance database');
    this.name = 'WrongKeyError';
  }
}

export interface OpenOptions {
  /** File path, or `:memory:` for tests. */
  readonly path: string;
  /** 32-byte key from `deriveKey`. Omit only for in-memory test databases. */
  readonly key?: Buffer;
  readonly readonly?: boolean;
  readonly fileMustExist?: boolean;
}

/**
 * The only way to open a database (ADR 0003): applies the key, verifies it, and sets the pragmas every
 * connection needs.
 */
export function openDatabase(options: OpenOptions): Db {
  const db = new Database(options.path, {
    readonly: options.readonly ?? false,
    fileMustExist: options.fileMustExist ?? false,
  });
  try {
    if (options.key) db.key(options.key);
    try {
      db.prepare('SELECT count(*) FROM sqlite_master').get();
    } catch {
      throw new WrongKeyError();
    }
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    if (options.path !== ':memory:' && !options.readonly) db.pragma('journal_mode = WAL');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
