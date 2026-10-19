# ADR 0003: Persistence, encryption and migrations

- Status: Accepted
- Date: 2026-10-19
- Milestone: M2
- Amends: ADR 0001 (drops Drizzle from the stack)

## Context

M2 stores the ledger on disk, encrypted, and imports the legacy database. The schema is small (six tables),
the important rules are `CHECK` constraints and append-only triggers, and balances are derived in
`packages/domain`, not in SQL.

## Decision

1. **Driver:** `better-sqlite3-multiple-ciphers` (SQLite3 Multiple Ciphers, default cipher ChaCha20-Poly1305).
   It is API-compatible with `better-sqlite3`, ships prebuilt binaries for Windows, macOS and Linux, and needs no
   install script.
2. **Key derivation:** the passphrase is never stored. `deriveKey` runs Argon2id (Node's built-in
   `crypto.argon2`, 64 MiB, 3 passes) over the passphrase and a random 16-byte salt; the 32-byte result is the
   database key. The salt is not secret and lives next to the database (`finance.salt`).
3. **Login is decryption:** a wrong passphrase yields a key that cannot read the file. `openDatabase` verifies
   the key immediately and throws `WrongKeyError`. No passphrase hash is stored.
4. **One connection factory** (`openDatabase`) sets the key, `foreign_keys = ON`, `journal_mode = WAL` (files
   only) and `busy_timeout`, and is covered by a test.
5. **No ORM.** Migrations are plain SQL kept in `packages/db/src/migrations.ts` and applied in order inside a
   transaction, recorded in `schema_migrations`. Repositories use prepared statements (parameterized only).
   Drizzle (ADR 0001) is dropped: for six tables it would add `drizzle-kit` and a second schema language while
   the constraints that matter are SQL `CHECK`s and triggers anyway.
6. **The database enforces what it can:** per-kind link rules and amount/interest ranges as `CHECK`s,
   `reverses_entry_id UNIQUE` (an entry can be reversed once), and triggers that abort any `UPDATE` or `DELETE`
   on `ledger_entries`. The domain still validates first, so users get precise errors.
7. **Idempotency:** `ledger_entries.request_id` is `UNIQUE`; appending a known `request_id` returns the stored
   entry. Master-data writes use the `idempotency_keys` table.
8. **Legacy import** (`tools/import-legacy`) opens the legacy file read-only, imports into a fresh encrypted
   store and runs the golden check: account balances, liability balances and monthly income/expense recomputed
   straight from the legacy rows must equal the domain's figures. The report prints counts and ids, never
   amounts or names.

## Consequences

- `pnpm db:generate` disappears; migrations are written by hand and run automatically when the store is opened.
- Losing the passphrase means losing the data. Backups (encrypted `VACUUM INTO`) come later.
- Legacy free-text enums (account types, liquidity, liability types) are mapped by a table in the importer;
  unknown values stop the import and are listed so the table can be extended.
