declare const brand: unique symbol;

/** A primitive that TypeScript treats as a distinct type, so ids of different entities can't be swapped. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type AccountId = Brand<number, 'AccountId'>;
export type CategoryId = Brand<number, 'CategoryId'>;
export type EntryId = Brand<number, 'EntryId'>;
export type GoalId = Brand<number, 'GoalId'>;
export type LiabilityId = Brand<number, 'LiabilityId'>;

function positiveInteger(n: number, kind: string): number {
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new RangeError(`${kind} must be a positive integer`);
  }
  return n;
}

export const accountId = (n: number) => positiveInteger(n, 'AccountId') as AccountId;
export const categoryId = (n: number) => positiveInteger(n, 'CategoryId') as CategoryId;
export const entryId = (n: number) => positiveInteger(n, 'EntryId') as EntryId;
export const goalId = (n: number) => positiveInteger(n, 'GoalId') as GoalId;
export const liabilityId = (n: number) => positiveInteger(n, 'LiabilityId') as LiabilityId;
