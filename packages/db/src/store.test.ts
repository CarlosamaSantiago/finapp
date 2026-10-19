import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, WrongKeyError } from './connection.js';
import { deriveKey } from './key.js';
import { migrate, MIGRATIONS } from './migrations.js';
import { createStore, openStore, storeExists } from './store.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'finapp-store-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('openDatabase', () => {
  it('turns on foreign keys and WAL for files', () => {
    const db = openDatabase({ path: join(dir, 'plain.db') });
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    db.close();
  });

  it('turns on foreign keys in memory', () => {
    const db = openDatabase({ path: ':memory:' });
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });
});

describe('deriveKey', () => {
  it('is deterministic for the same passphrase and salt, and 32 bytes long', async () => {
    const salt = Buffer.alloc(16, 7);
    const a = await deriveKey('correct horse', salt);
    expect(a).toHaveLength(32);
    expect((await deriveKey('correct horse', salt)).equals(a)).toBe(true);
    expect((await deriveKey('correct horse!', salt)).equals(a)).toBe(false);
    expect((await deriveKey('correct horse', Buffer.alloc(16, 8))).equals(a)).toBe(false);
  });
});

describe('encrypted store', () => {
  it('round-trips with the right passphrase', async () => {
    const created = await createStore(dir, 'correct horse');
    created.exec(`INSERT INTO categories (name, created_at) VALUES ('Mercado', 'now')`);
    created.close();

    const reopened = await openStore(dir, 'correct horse');
    expect(reopened.prepare('SELECT name FROM categories').pluck().get()).toBe('Mercado');
    reopened.close();
  });

  it('rejects a wrong passphrase', async () => {
    (await createStore(dir, 'correct horse')).close();
    await expect(openStore(dir, 'wrong horse')).rejects.toBeInstanceOf(WrongKeyError);
  });

  it('writes no readable SQLite header or plaintext to disk', async () => {
    const db = await createStore(dir, 'correct horse');
    db.exec(`INSERT INTO categories (name, created_at) VALUES ('SecretCategoryName', 'now')`);
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    const bytes = readFileSync(join(dir, 'finance.db'));
    expect(bytes.subarray(0, 15).toString('latin1')).not.toBe('SQLite format 3');
    expect(bytes.includes('SecretCategoryName')).toBe(false);
  });

  it('refuses to overwrite an existing store', async () => {
    (await createStore(dir, 'correct horse')).close();
    expect(storeExists(dir)).toBe(true);
    await expect(createStore(dir, 'another')).rejects.toThrow(/already exists/);
  });

  it('fails cleanly when the salt file is corrupt', async () => {
    (await createStore(dir, 'correct horse')).close();
    rmSync(join(dir, 'finance.salt'));
    await expect(openStore(dir, 'correct horse')).rejects.toThrow();
  });
});

describe('migrate', () => {
  it('applies every migration once', () => {
    const db = openDatabase({ path: ':memory:' });
    expect(migrate(db)).toBe(MIGRATIONS.length);
    expect(migrate(db)).toBe(0);
    expect(db.prepare('SELECT count(*) FROM schema_migrations').pluck().get()).toBe(
      MIGRATIONS.length,
    );
    db.close();
  });
});
