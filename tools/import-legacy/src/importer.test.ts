import {
  accountsRepository,
  categoriesRepository,
  ledgerRepository,
  migrate,
  openDatabase,
  type Db,
} from '@finapp/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { goldenCheck } from './golden.js';
import { importLegacy } from './importer.js';
import { LegacySchemaError, readLegacy } from './legacy.js';

const now = () => '2026-10-19T12:00:00.000Z';

/** A synthetic database in the legacy app's format (REVERSE_ENGINEERING.md §2). Not real data. */
function legacyDb(): Db {
  const db = openDatabase({ path: ':memory:' });
  db.exec(`
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT UNIQUE, account_type TEXT, liquidity TEXT,
      initial_balance TEXT, annual_return_rate TEXT, is_active INTEGER, is_emergency_eligible INTEGER);
    CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT, movement_type TEXT, is_active INTEGER);
    CREATE TABLE liabilities (id INTEGER PRIMARY KEY, name TEXT UNIQUE, liability_type TEXT,
      opening_balance TEXT, current_balance TEXT, annual_interest_rate TEXT, is_active INTEGER);
    CREATE TABLE goals (id INTEGER PRIMARY KEY, name TEXT UNIQUE, target_amount TEXT, target_date TEXT,
      monthly_contribution TEXT, priority INTEGER, account_id INTEGER, status TEXT);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, transaction_date TEXT, transaction_type TEXT,
      amount TEXT, interest_amount TEXT, request_id TEXT UNIQUE, category_id INTEGER,
      source_account_id INTEGER, destination_account_id INTEGER, goal_id INTEGER, liability_id INTEGER);
    CREATE TABLE budgets (id INTEGER PRIMARY KEY);
    CREATE TABLE recurring_transactions (id INTEGER PRIMARY KEY);

    INSERT INTO accounts VALUES
      (1, 'Ahorros', 'Ahorros', 'inmediata', '1000.00', '0', 1, 1),
      (2, 'Bolsillo', 'Efectivo', 'inmediata', '50.00', '0', 1, 0),
      (3, 'CDT', 'CDT', 'entre_1_y_6_meses', '2000.00', '0.1', 1, 0),
      (4, 'Vieja', 'Ahorros', 'inmediata', '0.00', '0', 0, 0);
    INSERT INTO categories VALUES
      (1, 'Salario', 'ingreso', 1), (2, 'Mercado', 'gasto', 1), (3, 'Mercado', 'ahorro', 1),
      (4, 'Deudas', 'pago_deuda', 1), (5, 'Metas', 'aporte_meta', 1), (6, 'Antigua', 'gasto', 0);
    INSERT INTO liabilities VALUES
      (1, 'Tarjeta', 'Tarjeta de crédito', '800.00', '650.00', '0.3', 1),
      (2, 'Moto', 'Crédito vehicular', '3000.00', '3000.00', '0.2', 0);
    INSERT INTO goals VALUES (1, 'Viaje', '1500.00', '2027-01-31', '100.00', 1, 1, 'activa');
    INSERT INTO budgets VALUES (1);
    INSERT INTO transactions VALUES
      (1, '2026-07-01', 'ingreso', '3000.00', NULL, 'r1', 1, NULL, 1, NULL, NULL),
      (2, '2026-07-03', 'gasto', '120.50', '0.00', 'r2', 2, 1, NULL, NULL, NULL),
      (3, '2026-07-05', 'transferencia', '100.00', NULL, 'r3', NULL, 1, 2, NULL, NULL),
      (4, '2026-07-06', 'ahorro', '500.00', '0.00', 'r4', 3, 1, 3, NULL, NULL),
      (5, '2026-08-01', 'aporte_meta', '200.00', NULL, 'r5', 5, 1, NULL, 1, NULL),
      (6, '2026-08-02', 'pago_deuda', '180.00', '30.00', 'r6', 4, 1, NULL, NULL, 1),
      (7, '2026-08-10', 'ajuste_saldo', '5.25', NULL, 'r7', NULL, NULL, 2, NULL, NULL),
      (8, '2026-08-11', 'ajuste_saldo', '1.00', NULL, 'r8', NULL, 2, NULL, NULL, NULL),
      (9, '2026-08-15', 'gasto', '40.00', '0.00', 'r9', 6, 2, NULL, NULL, NULL),
      (10, '2026-08-20', 'gasto', '10.00', '0.00', 'r10', 2, 4, NULL, NULL, NULL);
  `);
  return db;
}

let target: Db;
beforeEach(() => {
  target = openDatabase({ path: ':memory:' });
  migrate(target);
});

describe('importLegacy + goldenCheck', () => {
  it('imports every kind and reproduces legacy figures to the cent', () => {
    const legacy = readLegacy(legacyDb());
    const imported = importLegacy(legacy, target, now);
    expect(imported).toEqual({
      ok: true,
      counts: { accounts: 4, categories: 5, liabilities: 2, goals: 1, entries: 10 },
    });
    expect(legacy.skipped).toEqual({ budgets: 1, recurring_transactions: 0 });

    const report = goldenCheck(legacy, target, now);
    expect(report).toEqual({
      passed: true,
      accounts: { checked: 4, mismatches: [] },
      liabilities: { checked: 2, mismatches: [] },
      months: { checked: 2, mismatches: [] },
    });
  });

  it('maps legacy kinds per ADR 0002 and archives inactive master data last', () => {
    importLegacy(readLegacy(legacyDb()), target, now);
    const kinds = ledgerRepository(target, now)
      .list()
      .map((e) => e.kind);
    expect(kinds.filter((k) => k === 'transfer')).toHaveLength(2); // transferencia + ahorro
    expect(kinds.filter((k) => k === 'adjustment')).toHaveLength(2);
    expect(
      accountsRepository(target, now)
        .list()
        .map((a) => a.id),
    ).not.toContain(4);
    expect(
      categoriesRepository(target, now)
        .list()
        .map((c) => c.name),
    ).not.toContain('Antigua');
    expect(
      categoriesRepository(target, now)
        .list()
        .map((c) => c.name),
    ).toContain('Mercado');
  });

  it('fails the golden check when a legacy cache disagrees, listing ids but no amounts', () => {
    const db = legacyDb();
    db.exec(`UPDATE liabilities SET current_balance = '651.00' WHERE id = 1`);
    const legacy = readLegacy(db);
    importLegacy(legacy, target, now);
    const report = goldenCheck(legacy, target, now);
    expect(report.passed).toBe(false);
    expect(report.liabilities.mismatches).toEqual(['liability 1']);
  });

  it('stops without writing anything and lists unknown values and bad rows', () => {
    const db = legacyDb();
    db.exec(`
      UPDATE accounts SET account_type = 'Cripto' WHERE id = 2;
      UPDATE transactions SET amount = '1.234' WHERE id = 2;
      UPDATE transactions SET transaction_type = 'regalo' WHERE id = 3;
    `);
    const result = importLegacy(readLegacy(db), target, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.unknownValues.get('accounts.account_type')).toEqual(new Set(['cripto']));
    expect(result.issues.unknownValues.get('transactions.transaction_type')).toEqual(
      new Set(['regalo']),
    );
    expect(result.issues.rowProblems).toContain(
      'transactions 2: amount is not an exact decimal amount',
    );
    expect(accountsRepository(target, now).list({ includeArchived: true })).toEqual([]);
    expect(ledgerRepository(target, now).list()).toEqual([]);
  });

  it('reports ledger rule violations per legacy row', () => {
    const db = legacyDb();
    db.exec(`UPDATE transactions SET category_id = NULL WHERE id = 1`);
    const result = importLegacy(readLegacy(db), target, now);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.rowProblems).toEqual(['transactions 1: missing_field(categoryId)']);
    }
  });
});

describe('readLegacy', () => {
  it('names every missing table and column', () => {
    const db = openDatabase({ path: ':memory:' });
    db.exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT)');
    expect(() => readLegacy(db)).toThrow(LegacySchemaError);
    expect(() => readLegacy(db)).toThrow(
      /missing column accounts\.liquidity[\s\S]*missing table transactions/,
    );
  });
});
