import type { AccountDto, CategoryDto, EntryDto, GoalDto, LiabilityDto } from '@finapp/contracts';
import {
  accountBalance,
  goalProgress,
  liabilityBalance,
  type Account,
  type Category,
  type Goal,
  type LedgerEntry,
  type Liability,
} from '@finapp/domain';

export const accountDto = (a: Account, ledger: readonly LedgerEntry[]): AccountDto => ({
  id: a.id,
  name: a.name,
  type: a.type,
  liquidity: a.liquidity,
  initialBalanceMinor: a.initialBalance.minor,
  balanceMinor: accountBalance(a, ledger).minor,
  emergencyEligible: a.emergencyEligible,
  archived: a.archivedAt !== null,
});

export const categoryDto = (c: Category): CategoryDto => ({
  id: c.id,
  name: c.name,
  archived: c.archivedAt !== null,
});

export const liabilityDto = (l: Liability, ledger: readonly LedgerEntry[]): LiabilityDto => ({
  id: l.id,
  name: l.name,
  type: l.type,
  openingBalanceMinor: l.openingBalance.minor,
  balanceMinor: liabilityBalance(l, ledger).minor,
  archived: l.archivedAt !== null,
});

export const goalDto = (g: Goal, ledger: readonly LedgerEntry[]): GoalDto => ({
  id: g.id,
  name: g.name,
  targetMinor: g.target.minor,
  progressMinor: goalProgress(g.id, ledger).minor,
  targetDate: g.targetDate,
  accountId: g.accountId,
  archived: g.archivedAt !== null,
});

export function entryDto(e: LedgerEntry, ledger: readonly LedgerEntry[]): EntryDto {
  return {
    id: e.id,
    occurredOn: e.occurredOn,
    kind: e.kind,
    amountMinor: e.amount.minor,
    interestMinor: e.interest.minor,
    categoryId: e.categoryId,
    sourceAccountId: e.sourceAccountId,
    destinationAccountId: e.destinationAccountId,
    goalId: e.goalId,
    liabilityId: e.liabilityId,
    reversesEntryId: e.reversesEntryId,
    reversedByEntryId: ledger.find((x) => x.reversesEntryId === e.id)?.id ?? null,
    note: e.note,
  };
}
