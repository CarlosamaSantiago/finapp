import type { Db } from './connection.js';

interface Migration {
  readonly id: number;
  readonly name: string;
  readonly sql: string;
}

/** Append-only list. Never edit a migration that has shipped; add a new one (ADR 0003). */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'initial schema',
    sql: /* sql */ `
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
        type TEXT NOT NULL CHECK (type IN
          ('checking', 'savings', 'cash', 'term_deposit', 'investment', 'receivable', 'other')),
        liquidity TEXT NOT NULL CHECK (liquidity IN ('immediate', 'short_term', 'long_term')),
        initial_balance_minor INTEGER NOT NULL,
        emergency_eligible INTEGER NOT NULL DEFAULT 0 CHECK (emergency_eligible IN (0, 1)),
        created_at TEXT NOT NULL,
        archived_at TEXT
      ) STRICT;

      CREATE TABLE categories (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
        created_at TEXT NOT NULL,
        archived_at TEXT
      ) STRICT;

      CREATE TABLE liabilities (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
        type TEXT NOT NULL CHECK (type IN ('credit_card', 'loan', 'vehicle_loan', 'mortgage', 'other')),
        opening_balance_minor INTEGER NOT NULL CHECK (opening_balance_minor >= 0),
        created_at TEXT NOT NULL,
        archived_at TEXT
      ) STRICT;

      CREATE TABLE goals (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
        target_minor INTEGER NOT NULL CHECK (target_minor > 0),
        target_date TEXT,
        account_id INTEGER REFERENCES accounts (id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        archived_at TEXT
      ) STRICT;

      CREATE TABLE ledger_entries (
        id INTEGER PRIMARY KEY,
        occurred_on TEXT NOT NULL CHECK (occurred_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        kind TEXT NOT NULL CHECK (kind IN
          ('income', 'expense', 'transfer', 'goal_contribution', 'debt_payment', 'adjustment')),
        amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
        interest_minor INTEGER NOT NULL DEFAULT 0
          CHECK (interest_minor >= 0 AND interest_minor <= amount_minor),
        category_id INTEGER REFERENCES categories (id) ON DELETE RESTRICT,
        source_account_id INTEGER REFERENCES accounts (id) ON DELETE RESTRICT,
        destination_account_id INTEGER REFERENCES accounts (id) ON DELETE RESTRICT,
        goal_id INTEGER REFERENCES goals (id) ON DELETE RESTRICT,
        liability_id INTEGER REFERENCES liabilities (id) ON DELETE RESTRICT,
        request_id TEXT NOT NULL UNIQUE,
        reverses_entry_id INTEGER UNIQUE REFERENCES ledger_entries (id) ON DELETE RESTRICT,
        note TEXT,
        created_at TEXT NOT NULL,
        CHECK (source_account_id IS NOT destination_account_id OR source_account_id IS NULL),
        CHECK (kind = 'debt_payment' OR interest_minor = 0),
        -- Per-kind links, mirroring the RULES table in packages/domain (ADR 0002).
        CHECK (CASE kind
          WHEN 'income' THEN source_account_id IS NULL AND destination_account_id IS NOT NULL
            AND category_id IS NOT NULL AND goal_id IS NULL AND liability_id IS NULL
          WHEN 'expense' THEN source_account_id IS NOT NULL AND destination_account_id IS NULL
            AND category_id IS NOT NULL AND goal_id IS NULL AND liability_id IS NULL
          WHEN 'transfer' THEN source_account_id IS NOT NULL AND destination_account_id IS NOT NULL
            AND goal_id IS NULL AND liability_id IS NULL
          WHEN 'goal_contribution' THEN source_account_id IS NOT NULL AND destination_account_id IS NULL
            AND category_id IS NOT NULL AND goal_id IS NOT NULL AND liability_id IS NULL
          WHEN 'debt_payment' THEN source_account_id IS NOT NULL AND destination_account_id IS NULL
            AND category_id IS NOT NULL AND goal_id IS NULL AND liability_id IS NOT NULL
          WHEN 'adjustment' THEN (source_account_id IS NULL) <> (destination_account_id IS NULL)
            AND category_id IS NULL AND goal_id IS NULL AND liability_id IS NULL
            AND length(trim(coalesce(note, ''))) > 0
        END)
      ) STRICT;

      CREATE INDEX ledger_entries_occurred_on ON ledger_entries (occurred_on);

      CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE ON ledger_entries
      BEGIN SELECT RAISE(ABORT, 'ledger_entries is append-only'); END;

      CREATE TRIGGER ledger_entries_no_delete BEFORE DELETE ON ledger_entries
      BEGIN SELECT RAISE(ABORT, 'ledger_entries is append-only'); END;

      CREATE TABLE idempotency_keys (
        request_id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        response TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
    `,
  },
];

/** Applies pending migrations, each in its own transaction. Safe to call on every open. */
export function migrate(db: Db): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT`);
  const applied = new Set(db.prepare<[], number>('SELECT id FROM schema_migrations').pluck().all());
  const record = db.prepare(
    'INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)',
  );
  let count = 0;
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.id, migration.name, new Date().toISOString());
    })();
    count += 1;
  }
  return count;
}
