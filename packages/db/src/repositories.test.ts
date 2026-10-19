import {
  Money,
  accountBalance,
  entryId,
  liabilityBalance,
  netWorth,
  reverse,
  validateAppend,
  type LocalDate,
} from '@finapp/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from './connection.js';
import { idempotencyRepository, ledgerRepository, type NewEntry } from './ledger.js';
import {
  accountsRepository,
  categoriesRepository,
  goalsRepository,
  liabilitiesRepository,
} from './master-data.js';
import { migrate } from './migrations.js';
import { seedSynthetic } from './seed.js';

const now = () => '2026-10-19T12:00:00.000Z';
const today = '2026-10-19' as LocalDate;
let db: Db;

beforeEach(() => {
  db = openDatabase({ path: ':memory:' });
  migrate(db);
});

function fixtures() {
  const accounts = accountsRepository(db, now);
  const a = accounts.create({
    name: ' Ahorros ',
    type: 'savings',
    liquidity: 'immediate',
    initialBalance: Money.ofMinor(10_000),
    emergencyEligible: true,
  });
  const c = categoriesRepository(db, now).create({ name: 'Mercado' });
  if (!a.ok || !c.ok) throw new Error('fixture failed');
  return { accounts, account: a.value, category: c.value };
}

const expense = (
  over: Partial<NewEntry> & Pick<NewEntry, 'sourceAccountId' | 'categoryId'>,
): NewEntry => ({
  occurredOn: '2026-10-01' as LocalDate,
  kind: 'expense',
  amount: Money.ofMinor(2_500),
  interest: Money.zero,
  destinationAccountId: null,
  goalId: null,
  liabilityId: null,
  reversesEntryId: null,
  note: null,
  ...over,
});

describe('master data repositories', () => {
  it('creates, trims, lists and archives accounts', () => {
    const { accounts, account } = fixtures();
    expect(account).toMatchObject({ name: 'Ahorros', emergencyEligible: true, archivedAt: null });
    expect(account.initialBalance.minor).toBe(10_000);
    expect(accounts.get(account.id)?.name).toBe('Ahorros');
    expect(accounts.archive(account.id)).toBe(true);
    expect(accounts.archive(account.id)).toBe(false);
    expect(accounts.list()).toEqual([]);
    expect(accounts.list({ includeArchived: true })).toHaveLength(1);
  });

  it('reports duplicate names instead of throwing', () => {
    fixtures();
    expect(categoriesRepository(db, now).create({ name: 'Mercado' })).toEqual({
      ok: false,
      error: { code: 'duplicate_name' },
    });
  });

  it('round-trips liabilities and goals', () => {
    const { account } = fixtures();
    const liabilities = liabilitiesRepository(db, now);
    const goals = goalsRepository(db, now);
    const l = liabilities.create({
      name: 'Tarjeta',
      type: 'credit_card',
      openingBalance: Money.ofMinor(500),
    });
    const g = goals.create({
      name: 'Viaje',
      target: Money.ofMinor(9_000),
      targetDate: '2027-06-30' as LocalDate,
      accountId: account.id,
    });
    if (!l.ok || !g.ok) throw new Error('create failed');
    expect(liabilities.list()[0]?.openingBalance.minor).toBe(500);
    expect(goals.list()[0]).toMatchObject({
      name: 'Viaje',
      targetDate: '2027-06-30',
      accountId: account.id,
    });
    expect(goals.archive(g.value.id) && liabilities.archive(l.value.id)).toBe(true);
  });
});

describe('ledgerRepository', () => {
  it('appends valid entries with sequential ids and reloads them', () => {
    const { account, category } = fixtures();
    const ledger = ledgerRepository(db, now);
    const first = ledger.append(
      expense({ sourceAccountId: account.id, categoryId: category.id }),
      'r1',
    );
    const second = ledger.append(
      expense({ sourceAccountId: account.id, categoryId: category.id }),
      'r2',
    );
    expect(first.ok && second.ok && [first.value.id, second.value.id]).toEqual([1, 2]);
    const reloaded = ledger.list();
    expect(reloaded).toHaveLength(2);
    expect(accountBalance(account, reloaded).minor).toBe(5_000);
  });

  it('is idempotent per request_id', () => {
    const { account, category } = fixtures();
    const ledger = ledgerRepository(db, now);
    const entry = expense({ sourceAccountId: account.id, categoryId: category.id });
    const a = ledger.append(entry, 'same');
    const b = ledger.append({ ...entry, amount: Money.ofMinor(1) }, 'same');
    expect(b).toEqual(a);
    expect(ledger.list()).toHaveLength(1);
  });

  it('returns domain validation errors without writing', () => {
    const { account, category } = fixtures();
    const ledger = ledgerRepository(db, now);
    const result = ledger.append(
      expense({ sourceAccountId: account.id, categoryId: category.id, amount: Money.zero }),
      'r',
    );
    expect(result).toEqual({ ok: false, error: [{ code: 'amount_not_positive' }] });
    expect(ledger.list()).toEqual([]);
  });

  it('rejects unknown or archived references, except for reversals', () => {
    const { accounts, account, category } = fixtures();
    const ledger = ledgerRepository(db, now);
    const appended = ledger.append(
      expense({ sourceAccountId: account.id, categoryId: category.id }),
      'r1',
    );
    if (!appended.ok) throw new Error('append failed');

    expect(
      ledger.append(expense({ sourceAccountId: account.id, categoryId: 999 as never }), 'r2'),
    ).toEqual({
      ok: false,
      error: [{ code: 'unknown_reference', field: 'categoryId' }],
    });

    accounts.archive(account.id);
    expect(
      ledger.append(expense({ sourceAccountId: account.id, categoryId: category.id }), 'r3'),
    ).toMatchObject({
      ok: false,
      error: [{ code: 'unknown_reference', field: 'sourceAccountId' }],
    });

    const undo = reverse(appended.value, {
      id: entryId(2),
      occurredOn: '2026-10-02' as LocalDate,
      note: null,
    });
    expect(ledger.append(undo, 'r4').ok).toBe(true);
    expect(accountBalance(account, ledger.list()).minor).toBe(10_000);
  });
});

describe('idempotencyRepository', () => {
  it('runs an operation once per request id', () => {
    const keys = idempotencyRepository(db, now);
    let calls = 0;
    const run = () => keys.once('k1', 'createCategory', () => ({ id: ++calls }));
    expect(run()).toEqual({ id: 1 });
    expect(run()).toEqual({ id: 1 });
    expect(calls).toBe(1);
    expect(() => keys.once('k1', 'createAccount', () => ({}))).toThrow(/another operation/);
  });
});

describe('seedSynthetic', () => {
  it('creates a valid ledger covering every entry kind', () => {
    seedSynthetic(db, now, today);
    const entries = ledgerRepository(db, now).list();
    expect(new Set(entries.map((e) => e.kind))).toEqual(
      new Set(['income', 'expense', 'transfer', 'goal_contribution', 'debt_payment', 'adjustment']),
    );
    entries.forEach((e, i) => {
      expect(validateAppend(e, entries.slice(0, i)).ok).toBe(true);
    });
    const accounts = accountsRepository(db, now).list();
    const liabilities = liabilitiesRepository(db, now).list();
    const [card] = liabilities;
    if (!card) throw new Error('seed has no liability');
    expect(liabilityBalance(card, entries).minor).toBe((1_200_000 - 3 * 308_000) * 100);
    expect(netWorth(accounts, liabilities, entries).isPositive()).toBe(true);
    expect(entries.every((e) => e.occurredOn <= today)).toBe(true);
  });

  it('handles a January "today" (months roll back into the previous year)', () => {
    seedSynthetic(db, now, '2027-01-10' as LocalDate);
    const dates = ledgerRepository(db, now)
      .list()
      .map((e) => e.occurredOn);
    expect(dates).toContain('2026-11-01');
  });
});
