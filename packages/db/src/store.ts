import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, type Db } from './connection.js';
import { deriveKey, newSalt, SALT_BYTES } from './key.js';
import { migrate } from './migrations.js';

const DB_FILE = 'finance.db';
const SALT_FILE = 'finance.salt';

/** The encrypted store in a data directory: `finance.db` plus its (non-secret) salt. */
export const storeExists = (dir: string) => existsSync(join(dir, DB_FILE));

/** Creates a new encrypted, migrated store. Fails if one already exists. */
export async function createStore(dir: string, passphrase: string): Promise<Db> {
  if (storeExists(dir)) throw new Error('A store already exists in this directory');
  mkdirSync(dir, { recursive: true });
  const salt = newSalt();
  writeFileSync(join(dir, SALT_FILE), salt, { flag: 'wx' });
  const db = openDatabase({ path: join(dir, DB_FILE), key: await deriveKey(passphrase, salt) });
  migrate(db);
  return db;
}

/** Opens an existing store and applies pending migrations. Throws `WrongKeyError` on a wrong passphrase. */
export async function openStore(dir: string, passphrase: string): Promise<Db> {
  const salt = readFileSync(join(dir, SALT_FILE));
  if (salt.length !== SALT_BYTES) throw new Error('Salt file is corrupt');
  const db = openDatabase({
    path: join(dir, DB_FILE),
    key: await deriveKey(passphrase, salt),
    fileMustExist: true,
  });
  migrate(db);
  return db;
}
