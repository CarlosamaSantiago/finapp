import type { LocalDate } from '../dates.js';
import type { AccountId, CategoryId, EntryId, GoalId, LiabilityId } from '../ids.js';
import { Money } from '../money.js';
import { err, ok, type Result } from '../result.js';

export const ENTRY_KINDS = [
  'income',
  'expense',
  'transfer',
  'goal_contribution',
  'debt_payment',
  'adjustment',
] as const;

export type EntryKind = (typeof ENTRY_KINDS)[number];

/** One row of the append-only ledger. Mistakes are fixed with a reversal, never by editing. */
export interface LedgerEntry {
  readonly id: EntryId;
  readonly occurredOn: LocalDate;
  readonly kind: EntryKind;
  readonly amount: Money;
  /** Interest part of a `debt_payment`; zero for every other kind. */
  readonly interest: Money;
  readonly categoryId: CategoryId | null;
  readonly sourceAccountId: AccountId | null;
  readonly destinationAccountId: AccountId | null;
  readonly goalId: GoalId | null;
  readonly liabilityId: LiabilityId | null;
  readonly reversesEntryId: EntryId | null;
  readonly note: string | null;
}

export type EntryField =
  'sourceAccountId' | 'destinationAccountId' | 'categoryId' | 'goalId' | 'liabilityId';

export type EntryError =
  | { readonly code: 'missing_field'; readonly field: EntryField }
  | { readonly code: 'forbidden_field'; readonly field: EntryField }
  | { readonly code: 'amount_not_positive' }
  | { readonly code: 'interest_out_of_range' }
  | { readonly code: 'same_account' }
  | { readonly code: 'adjustment_needs_one_side' }
  | { readonly code: 'note_required' };

type Rule = 'required' | 'optional' | 'forbidden';

/** Which links each kind uses. Mirrors the table in docs/adr/0002-money-dates-and-ledger-kinds.md. */
const RULES: Record<EntryKind, Record<EntryField, Rule>> = {
  income: {
    sourceAccountId: 'forbidden',
    destinationAccountId: 'required',
    categoryId: 'required',
    goalId: 'forbidden',
    liabilityId: 'forbidden',
  },
  expense: {
    sourceAccountId: 'required',
    destinationAccountId: 'forbidden',
    categoryId: 'required',
    goalId: 'forbidden',
    liabilityId: 'forbidden',
  },
  transfer: {
    sourceAccountId: 'required',
    destinationAccountId: 'required',
    categoryId: 'optional',
    goalId: 'forbidden',
    liabilityId: 'forbidden',
  },
  goal_contribution: {
    sourceAccountId: 'required',
    destinationAccountId: 'forbidden',
    categoryId: 'required',
    goalId: 'required',
    liabilityId: 'forbidden',
  },
  debt_payment: {
    sourceAccountId: 'required',
    destinationAccountId: 'forbidden',
    categoryId: 'required',
    goalId: 'forbidden',
    liabilityId: 'required',
  },
  adjustment: {
    sourceAccountId: 'optional',
    destinationAccountId: 'optional',
    categoryId: 'forbidden',
    goalId: 'forbidden',
    liabilityId: 'forbidden',
  },
};

/** Checks the rules of a single entry in isolation. Returns every violation, not just the first. */
export function validateEntry(entry: LedgerEntry): Result<LedgerEntry, readonly EntryError[]> {
  const errors: EntryError[] = [];
  const rules = RULES[entry.kind];

  for (const field of Object.keys(rules) as EntryField[]) {
    const present = entry[field] !== null;
    if (rules[field] === 'required' && !present) errors.push({ code: 'missing_field', field });
    if (rules[field] === 'forbidden' && present) errors.push({ code: 'forbidden_field', field });
  }

  if (!entry.amount.isPositive()) errors.push({ code: 'amount_not_positive' });

  const interestAllowed = entry.kind === 'debt_payment';
  if (
    entry.interest.isNegative() ||
    entry.interest.compare(entry.amount) > 0 ||
    (!interestAllowed && !entry.interest.isZero())
  ) {
    errors.push({ code: 'interest_out_of_range' });
  }

  if (entry.sourceAccountId !== null && entry.sourceAccountId === entry.destinationAccountId) {
    errors.push({ code: 'same_account' });
  }

  if (entry.kind === 'adjustment') {
    if ((entry.sourceAccountId === null) === (entry.destinationAccountId === null)) {
      errors.push({ code: 'adjustment_needs_one_side' });
    }
    if (entry.note === null || entry.note.trim() === '') errors.push({ code: 'note_required' });
  }

  return errors.length === 0 ? ok(entry) : err(errors);
}

/** Principal part of an entry: `amount - interest`. */
export const principalOf = (entry: LedgerEntry): Money => entry.amount.subtract(entry.interest);
