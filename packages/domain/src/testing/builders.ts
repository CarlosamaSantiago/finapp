import type { LocalDate } from '../dates.js';
import { accountId, categoryId, entryId, goalId, liabilityId } from '../ids.js';
import type { EntryKind, LedgerEntry } from '../ledger/entry.js';
import { Money } from '../money.js';

export const A1 = accountId(1);
export const A2 = accountId(2);
export const C1 = categoryId(1);
export const G1 = goalId(1);
export const L1 = liabilityId(1);

const VALID: Record<EntryKind, Partial<LedgerEntry>> = {
  income: { destinationAccountId: A1, categoryId: C1 },
  expense: { sourceAccountId: A1, categoryId: C1 },
  transfer: { sourceAccountId: A1, destinationAccountId: A2 },
  goal_contribution: { sourceAccountId: A1, categoryId: C1, goalId: G1 },
  debt_payment: { sourceAccountId: A1, categoryId: C1, liabilityId: L1 },
  adjustment: { destinationAccountId: A1, note: 'Unrecorded bank fee refund' },
};

/** A valid entry of the given kind; override any field. Amounts are in minor units. */
export function entry(
  kind: EntryKind,
  overrides: Partial<LedgerEntry> & { id?: number; minor?: number } = {},
): LedgerEntry {
  const { id = 1, minor = 10_000, ...rest } = overrides;
  return {
    id: entryId(id),
    occurredOn: '2026-10-01' as LocalDate,
    kind,
    amount: Money.ofMinor(minor),
    interest: Money.zero,
    categoryId: null,
    sourceAccountId: null,
    destinationAccountId: null,
    goalId: null,
    liabilityId: null,
    reversesEntryId: null,
    note: null,
    ...VALID[kind],
    ...rest,
  };
}
