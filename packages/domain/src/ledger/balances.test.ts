import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { LocalDate, YearMonth } from '../dates.js';
import { accountId, entryId, liabilityId } from '../ids.js';
import { Money } from '../money.js';
import { GOALS, entryWithId, ledger, openings } from '../testing/arbitraries.js';
import { A1, A2, G1, L1, entry } from '../testing/builders.js';
import { reverse, validateAppend } from './append.js';
import {
  accountBalance,
  goalProgress,
  liabilityBalance,
  monthlyTotals,
  netWorth,
  type AccountOpening,
  type LiabilityOpening,
} from './balances.js';
import { entryEffects } from './effects.js';
import type { LedgerEntry } from './entry.js';

const m = (minor: number) => Money.ofMinor(minor);
const account1: AccountOpening = { id: A1, initialBalance: m(100_000) };
const account2: AccountOpening = { id: A2, initialBalance: m(50_000) };
const debt: LiabilityOpening = { id: L1, openingBalance: m(400_000) };

/** Every account, liability and goal balance, for comparing two ledgers. */
const snapshot = (
  opening: { accounts: readonly AccountOpening[]; liabilities: readonly LiabilityOpening[] },
  entries: readonly LedgerEntry[],
) => ({
  accounts: opening.accounts.map((a) => accountBalance(a, entries).minor),
  liabilities: opening.liabilities.map((l) => liabilityBalance(l, entries).minor),
  goals: GOALS.map((g) => goalProgress(g, entries).minor),
  netWorth: netWorth(opening.accounts, opening.liabilities, entries).minor,
});

describe('balances (example ledger)', () => {
  const ledgerExample = [
    entry('income', { id: 1, minor: 300_000, destinationAccountId: A1 }),
    entry('expense', { id: 2, minor: 20_000, sourceAccountId: A1 }),
    entry('transfer', { id: 3, minor: 30_000, sourceAccountId: A1, destinationAccountId: A2 }),
    entry('goal_contribution', { id: 4, minor: 10_000, sourceAccountId: A2, goalId: G1 }),
    entry('debt_payment', { id: 5, minor: 60_000, interest: m(15_000), sourceAccountId: A1 }),
    entry('adjustment', { id: 6, minor: 500, destinationAccountId: null, sourceAccountId: A2 }),
  ];

  it('derives account balances', () => {
    // A1: 100000 + 300000 - 20000 - 30000 - 60000
    expect(accountBalance(account1, ledgerExample).minor).toBe(290_000);
    // A2: 50000 + 30000 - 10000 - 500
    expect(accountBalance(account2, ledgerExample).minor).toBe(69_500);
  });

  it('reduces the liability by principal only', () => {
    expect(liabilityBalance(debt, ledgerExample).minor).toBe(400_000 - 45_000);
  });

  it('tracks goal progress and its effect on net worth', () => {
    expect(goalProgress(G1, ledgerExample).minor).toBe(10_000);
    expect(netWorth([account1, account2], [debt], ledgerExample).minor).toBe(
      290_000 + 69_500 - 355_000,
    );
  });

  it('ignores accounts and liabilities it is not asked about', () => {
    expect(accountBalance({ id: accountId(99), initialBalance: m(7) }, ledgerExample).minor).toBe(
      7,
    );
    expect(
      liabilityBalance({ id: liabilityId(99), openingBalance: m(7) }, ledgerExample).minor,
    ).toBe(7);
  });
});

describe('monthlyTotals', () => {
  const income = entry('income', { id: 1, minor: 5_000, occurredOn: '2026-09-30' as LocalDate });
  const expense = entry('expense', { id: 2, minor: 1_200, occurredOn: '2026-09-15' as LocalDate });
  const undo = reverse(expense, {
    id: entryId(3),
    occurredOn: '2026-10-02' as LocalDate,
    note: null,
  });

  it('groups income and expense by month', () => {
    expect(monthlyTotals([income, expense]).get('2026-09' as YearMonth)).toEqual({
      income: m(5_000),
      expense: m(1_200),
    });
  });

  it('counts a reversal in its own month', () => {
    const totals = monthlyTotals([income, expense, undo]);
    expect(totals.get('2026-09' as YearMonth)?.expense.minor).toBe(1_200);
    expect(totals.get('2026-10' as YearMonth)?.expense.minor).toBe(-1_200);
  });

  it('ignores transfers, goals, debt payments and adjustments', () => {
    expect(
      monthlyTotals([entry('transfer'), entry('debt_payment'), entry('adjustment')]).size,
    ).toBe(0);
  });
});

describe('entryEffects', () => {
  it('throws on an entry that skipped validation', () => {
    expect(() => entryEffects(entry('income', { destinationAccountId: null }))).toThrow(TypeError);
  });
});

describe('ledger properties', () => {
  it('generated ledgers are accepted entry by entry', () => {
    fc.assert(
      fc.property(ledger, (entries) => {
        entries.forEach((e, i) => {
          expect(validateAppend(e, entries.slice(0, i))).toMatchObject({ ok: true });
        });
      }),
    );
  });

  it('transfers never change net worth', () => {
    fc.assert(
      fc.property(openings, ledger, (opening, entries) => {
        const withTransfers = netWorth(opening.accounts, opening.liabilities, entries);
        const withoutTransfers = netWorth(
          opening.accounts,
          opening.liabilities,
          entries.filter((e) => e.kind !== 'transfer'),
        );
        expect(withTransfers.minor).toBe(withoutTransfers.minor);
      }),
    );
  });

  it('a reversal restores every balance', () => {
    fc.assert(
      fc.property(openings, ledger, entryWithId(1000), (opening, entries, extra) => {
        const undo = reverse(extra, {
          id: entryId(1001),
          occurredOn: extra.occurredOn,
          note: extra.kind === 'adjustment' ? 'Entered twice' : null,
        });
        expect(snapshot(opening, [...entries, extra, undo])).toEqual(snapshot(opening, entries));
      }),
    );
  });

  it('balances do not depend on entry order', () => {
    fc.assert(
      fc.property(
        openings,
        ledger.chain((entries) =>
          fc.tuple(
            fc.constant(entries),
            fc.shuffledSubarray(entries, { minLength: entries.length }),
          ),
        ),
        (opening, [entries, shuffled]) => {
          expect(snapshot(opening, shuffled)).toEqual(snapshot(opening, entries));
        },
      ),
    );
  });

  it('account totals change only by external flows', () => {
    fc.assert(
      fc.property(openings, ledger, (opening, entries) => {
        const initial = Money.sum(opening.accounts.map((a) => a.initialBalance));
        const current = Money.sum(opening.accounts.map((a) => accountBalance(a, entries)));
        // Computed independently of entryEffects: transfers are internal, everything else crosses the boundary.
        const external = Money.sum(
          entries.map((e) => {
            const sign = e.reversesEntryId === null ? 1 : -1;
            const inflow =
              e.kind === 'income' || (e.kind === 'adjustment' && e.destinationAccountId !== null);
            const amount = e.kind === 'transfer' ? 0 : inflow ? e.amount.minor : -e.amount.minor;
            return Money.ofMinor(sign * amount);
          }),
        );
        expect(current.subtract(initial).minor).toBe(external.minor);
      }),
    );
  });

  it('a debt payment lowers the liability by its principal', () => {
    fc.assert(
      fc.property(openings, ledger, entryWithId(1000), (opening, entries, payment) => {
        fc.pre(payment.kind === 'debt_payment');
        for (const liability of opening.liabilities) {
          const before = liabilityBalance(liability, entries);
          const after = liabilityBalance(liability, [...entries, payment]);
          const expected =
            payment.liabilityId === liability.id
              ? before.subtract(payment.amount.subtract(payment.interest))
              : before;
          expect(after.minor).toBe(expected.minor);
        }
      }),
    );
  });

  it('monthly totals add up to the signed income and expense of the whole ledger', () => {
    fc.assert(
      fc.property(ledger, (entries) => {
        const months = [...monthlyTotals(entries).values()];
        const signedSum = (kind: 'income' | 'expense') =>
          Money.sum(
            entries
              .filter((e) => e.kind === kind)
              .map((e) => (e.reversesEntryId === null ? e.amount : e.amount.negate())),
          ).minor;
        expect(Money.sum(months.map((t) => t.income)).minor).toBe(signedSum('income'));
        expect(Money.sum(months.map((t) => t.expense)).minor).toBe(signedSum('expense'));
      }),
    );
  });
});
