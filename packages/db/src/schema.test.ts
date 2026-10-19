import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from './connection.js';
import { migrate } from './migrations.js';

let db: Db;
const insertEntry = (fields: Record<string, unknown>) => {
  const row = {
    occurred_on: '2026-10-01',
    kind: 'expense',
    amount_minor: 100,
    interest_minor: 0,
    category_id: 1,
    source_account_id: 1,
    destination_account_id: null,
    goal_id: null,
    liability_id: null,
    request_id: `r-${String(Math.random())}`,
    reverses_entry_id: null,
    note: null,
    created_at: 'now',
    ...fields,
  };
  const columns = Object.keys(row);
  return db
    .prepare(
      `INSERT INTO ledger_entries (${columns.join(', ')}) VALUES (${columns.map((c) => '@' + c).join(', ')})`,
    )
    .run(row);
};

beforeEach(() => {
  db = openDatabase({ path: ':memory:' });
  migrate(db);
  db.exec(`
    INSERT INTO accounts (id, name, type, liquidity, initial_balance_minor, created_at)
      VALUES (1, 'A', 'savings', 'immediate', 0, 'now'), (2, 'B', 'cash', 'immediate', 0, 'now');
    INSERT INTO categories (id, name, created_at) VALUES (1, 'C', 'now');
    INSERT INTO liabilities (id, name, type, opening_balance_minor, created_at)
      VALUES (1, 'L', 'loan', 1000, 'now');
  `);
});

describe('ledger_entries constraints', () => {
  it('accepts a valid expense', () => {
    expect(insertEntry({}).changes).toBe(1);
  });

  it('is STRICT: rejects a decimal amount', () => {
    expect(() => insertEntry({ amount_minor: 12.5 })).toThrow();
  });

  it.each([
    ['non-positive amount', { amount_minor: 0 }],
    ['unknown kind', { kind: 'gasto' }],
    ['expense without category', { category_id: null }],
    ['expense with destination', { destination_account_id: 2 }],
    ['interest on an expense', { interest_minor: 1 }],
    ['transfer to the same account', { kind: 'transfer', destination_account_id: 1 }],
    ['debt payment without liability', { kind: 'debt_payment' }],
    ['interest above amount', { kind: 'debt_payment', liability_id: 1, interest_minor: 101 }],
    [
      'adjustment without a reason',
      { kind: 'adjustment', category_id: null, source_account_id: null, destination_account_id: 1 },
    ],
    ['malformed date', { occurred_on: '01/10/2026' }],
    ['unknown account', { source_account_id: 99 }],
  ])('rejects %s', (_name, fields) => {
    expect(() => insertEntry(fields)).toThrow();
  });

  it('rejects a reused request_id', () => {
    insertEntry({ request_id: 'same' });
    expect(() => insertEntry({ request_id: 'same' })).toThrow(/UNIQUE/);
  });

  it('allows an entry to be reversed only once', () => {
    insertEntry({ id: 1 });
    insertEntry({ reverses_entry_id: 1 });
    expect(() => insertEntry({ reverses_entry_id: 1 })).toThrow(/UNIQUE/);
  });

  it('is append-only', () => {
    insertEntry({ id: 1 });
    expect(() => db.exec('UPDATE ledger_entries SET amount_minor = 5 WHERE id = 1')).toThrow(
      /append-only/,
    );
    expect(() => db.exec('DELETE FROM ledger_entries WHERE id = 1')).toThrow(/append-only/);
  });

  it('blocks deleting master data that the ledger references', () => {
    insertEntry({});
    expect(() => db.exec('DELETE FROM accounts WHERE id = 1')).toThrow(/FOREIGN KEY/);
  });
});
