import type { AccountId, GoalId, LiabilityId } from '../ids.js';
import type { Money } from '../money.js';
import { principalOf, type LedgerEntry } from './entry.js';

/** How one entry changes balances. The single definition every balance is derived from. */
export interface EntryEffects {
  readonly accounts: ReadonlyMap<AccountId, Money>;
  readonly liabilities: ReadonlyMap<LiabilityId, Money>;
  readonly goals: ReadonlyMap<GoalId, Money>;
}

function present<T>(value: T | null, field: string): T {
  if (value === null) throw new TypeError(`Invalid entry: ${field} is required`);
  return value;
}

/** Effects of a valid entry (see ADR 0002). A reversal has exactly the opposite effects. */
export function entryEffects(entry: LedgerEntry): EntryEffects {
  const accounts = new Map<AccountId, Money>();
  const liabilities = new Map<LiabilityId, Money>();
  const goals = new Map<GoalId, Money>();
  const signed = (m: Money) => (entry.reversesEntryId === null ? m : m.negate());
  const debit = () =>
    accounts.set(present(entry.sourceAccountId, 'sourceAccountId'), signed(entry.amount.negate()));
  const credit = () =>
    accounts.set(present(entry.destinationAccountId, 'destinationAccountId'), signed(entry.amount));

  switch (entry.kind) {
    case 'income':
      credit();
      break;
    case 'expense':
      debit();
      break;
    case 'transfer':
      debit();
      credit();
      break;
    case 'goal_contribution':
      debit();
      goals.set(present(entry.goalId, 'goalId'), signed(entry.amount));
      break;
    case 'debt_payment':
      debit();
      liabilities.set(
        present(entry.liabilityId, 'liabilityId'),
        signed(principalOf(entry).negate()),
      );
      break;
    case 'adjustment':
      if (entry.sourceAccountId === null) credit();
      else debit();
      break;
  }

  return { accounts, liabilities, goals };
}
