import type { LocalDate } from './dates.js';
import type { AccountId, CategoryId, GoalId, LiabilityId } from './ids.js';
import type { Money } from './money.js';

export const ACCOUNT_TYPES = [
  'checking',
  'savings',
  'cash',
  'term_deposit',
  'investment',
  'receivable',
  'other',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** How quickly the money in an account can be used. */
export const LIQUIDITY_LEVELS = ['immediate', 'short_term', 'long_term'] as const;
export type Liquidity = (typeof LIQUIDITY_LEVELS)[number];

export const LIABILITY_TYPES = [
  'credit_card',
  'loan',
  'vehicle_loan',
  'mortgage',
  'other',
] as const;
export type LiabilityType = (typeof LIABILITY_TYPES)[number];

/** Master data is never deleted, only archived (`archivedAt`). */
export interface Account {
  readonly id: AccountId;
  readonly name: string;
  readonly type: AccountType;
  readonly liquidity: Liquidity;
  readonly initialBalance: Money;
  readonly emergencyEligible: boolean;
  readonly archivedAt: string | null;
}

export interface Category {
  readonly id: CategoryId;
  readonly name: string;
  readonly archivedAt: string | null;
}

export interface Liability {
  readonly id: LiabilityId;
  readonly name: string;
  readonly type: LiabilityType;
  readonly openingBalance: Money;
  readonly archivedAt: string | null;
}

export interface Goal {
  readonly id: GoalId;
  readonly name: string;
  readonly target: Money;
  readonly targetDate: LocalDate | null;
  readonly accountId: AccountId | null;
  readonly archivedAt: string | null;
}
