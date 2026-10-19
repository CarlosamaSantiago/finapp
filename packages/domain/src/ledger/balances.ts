import { yearMonthOf, type YearMonth } from '../dates.js';
import type { AccountId, GoalId, LiabilityId } from '../ids.js';
import { Money } from '../money.js';
import { entryEffects, type EntryEffects } from './effects.js';
import type { LedgerEntry } from './entry.js';

export interface AccountOpening {
  readonly id: AccountId;
  readonly initialBalance: Money;
}

export interface LiabilityOpening {
  readonly id: LiabilityId;
  readonly openingBalance: Money;
}

export interface MonthlyTotals {
  readonly income: Money;
  readonly expense: Money;
}

function total<K>(
  ledger: readonly LedgerEntry[],
  pick: (effects: EntryEffects) => ReadonlyMap<K, Money>,
  key: K,
): Money {
  return Money.sum(ledger.map((entry) => pick(entryEffects(entry)).get(key) ?? Money.zero));
}

/** Initial balance plus every inflow minus every outflow. */
export const accountBalance = (account: AccountOpening, ledger: readonly LedgerEntry[]) =>
  account.initialBalance.add(total(ledger, (e) => e.accounts, account.id));

/** Opening balance minus the principal of every payment. Interest never reduces the debt. */
export const liabilityBalance = (liability: LiabilityOpening, ledger: readonly LedgerEntry[]) =>
  liability.openingBalance.add(total(ledger, (e) => e.liabilities, liability.id));

/** Sum of contributions to the goal, net of reversals. */
export const goalProgress = (goal: GoalId, ledger: readonly LedgerEntry[]) =>
  total(ledger, (e) => e.goals, goal);

/** Everything the accounts hold minus everything still owed. */
export function netWorth(
  accounts: readonly AccountOpening[],
  liabilities: readonly LiabilityOpening[],
  ledger: readonly LedgerEntry[],
): Money {
  const assets = Money.sum(accounts.map((a) => accountBalance(a, ledger)));
  const debts = Money.sum(liabilities.map((l) => liabilityBalance(l, ledger)));
  return assets.subtract(debts);
}

/** Income and expense per month. A reversal counts in its own month (ADR 0002). */
export function monthlyTotals(
  ledger: readonly LedgerEntry[],
): ReadonlyMap<YearMonth, MonthlyTotals> {
  const totals = new Map<YearMonth, MonthlyTotals>();
  for (const entry of ledger) {
    if (entry.kind !== 'income' && entry.kind !== 'expense') continue;
    const month = yearMonthOf(entry.occurredOn);
    const current = totals.get(month) ?? { income: Money.zero, expense: Money.zero };
    const amount = entry.reversesEntryId === null ? entry.amount : entry.amount.negate();
    totals.set(
      month,
      entry.kind === 'income'
        ? { ...current, income: current.income.add(amount) }
        : { ...current, expense: current.expense.add(amount) },
    );
  }
  return totals;
}
