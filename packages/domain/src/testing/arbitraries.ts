import fc from 'fast-check';
import type { LocalDate } from '../dates.js';
import { accountId, categoryId, entryId, goalId, liabilityId } from '../ids.js';
import { reverse } from '../ledger/append.js';
import type { AccountOpening, LiabilityOpening } from '../ledger/balances.js';
import type { LedgerEntry } from '../ledger/entry.js';
import { Money } from '../money.js';

export const ACCOUNTS = [1, 2, 3].map(accountId);
export const LIABILITIES = [1, 2].map(liabilityId);
export const GOALS = [1, 2].map(goalId);
const CATEGORY = categoryId(1);

const account = fc.constantFrom(...ACCOUNTS);
const pad = (n: number) => String(n).padStart(2, '0');
const date = fc
  .tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
  .map(([m, d]) => `2026-${pad(m)}-${pad(d)}` as LocalDate);
const balance = fc.integer({ min: 0, max: 1_000_000_000 }).map((n) => Money.ofMinor(n));

/** Kind-specific fields of a valid entry. */
const shape = fc.oneof(
  account.map((a) => ({ kind: 'income' as const, destinationAccountId: a, categoryId: CATEGORY })),
  account.map((a) => ({ kind: 'expense' as const, sourceAccountId: a, categoryId: CATEGORY })),
  fc
    .tuple(account, account, fc.boolean())
    .filter(([s, d]) => s !== d)
    .map(([s, d, withCategory]) => ({
      kind: 'transfer' as const,
      sourceAccountId: s,
      destinationAccountId: d,
      categoryId: withCategory ? CATEGORY : null,
    })),
  fc.tuple(account, fc.constantFrom(...GOALS)).map(([a, g]) => ({
    kind: 'goal_contribution' as const,
    sourceAccountId: a,
    goalId: g,
    categoryId: CATEGORY,
  })),
  fc.tuple(account, fc.constantFrom(...LIABILITIES)).map(([a, l]) => ({
    kind: 'debt_payment' as const,
    sourceAccountId: a,
    liabilityId: l,
    categoryId: CATEGORY,
  })),
  fc.tuple(account, fc.boolean()).map(([a, credit]) => ({
    kind: 'adjustment' as const,
    sourceAccountId: credit ? null : a,
    destinationAccountId: credit ? a : null,
    note: 'Reconcile with bank statement',
  })),
);

/** A valid, non-reversal entry with the given id. */
export const entryWithId = (id: number): fc.Arbitrary<LedgerEntry> =>
  fc
    .record({
      shape,
      occurredOn: date,
      minor: fc.integer({ min: 1, max: 10_000_000 }),
      interestPercent: fc.integer({ min: 0, max: 100 }),
    })
    .map(({ shape, occurredOn, minor, interestPercent }): LedgerEntry => ({
      id: entryId(id),
      occurredOn,
      amount: Money.ofMinor(minor),
      interest:
        shape.kind === 'debt_payment'
          ? Money.ofMinor(Math.floor((minor * interestPercent) / 100))
          : Money.zero,
      categoryId: null,
      sourceAccountId: null,
      destinationAccountId: null,
      goalId: null,
      liabilityId: null,
      reversesEntryId: null,
      note: null,
      ...shape,
    }));

/** A valid ledger: up to 30 entries followed by reversals of a random subset of them. */
export const ledger: fc.Arbitrary<LedgerEntry[]> = fc
  .integer({ min: 0, max: 30 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => entryWithId(i + 1))))
  .chain((entries) =>
    fc.subarray(entries).map((reversed) => [
      ...entries,
      ...reversed.map((original, i) =>
        reverse(original, {
          id: entryId(entries.length + i + 1),
          occurredOn: original.occurredOn,
          note: original.kind === 'adjustment' ? 'Entered twice' : null,
        }),
      ),
    ]),
  );

export const openings = fc.record({
  accounts: fc.tuple(
    ...ACCOUNTS.map((id) => balance.map((b): AccountOpening => ({ id, initialBalance: b }))),
  ),
  liabilities: fc.tuple(
    ...LIABILITIES.map((id) => balance.map((b): LiabilityOpening => ({ id, openingBalance: b }))),
  ),
});
