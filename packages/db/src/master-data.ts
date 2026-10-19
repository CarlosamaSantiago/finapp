import {
  Money,
  err,
  ok,
  type Account,
  type AccountId,
  type AccountType,
  type Category,
  type CategoryId,
  type Goal,
  type GoalId,
  type Liability,
  type LiabilityId,
  type LiabilityType,
  type Liquidity,
  type LocalDate,
  type Result,
} from '@finapp/domain';
import type { Db } from './connection.js';
import { isUniqueViolation } from './errors.js';

export type Now = () => string;
export type CreateError = { readonly code: 'duplicate_name' };

interface ListOptions {
  readonly includeArchived?: boolean;
}

const active = (opts: ListOptions) => (opts.includeArchived ? '' : 'WHERE archived_at IS NULL');

function tryInsert<T>(insert: () => T): Result<T, CreateError> {
  try {
    return ok(insert());
  } catch (error) {
    if (isUniqueViolation(error)) return err({ code: 'duplicate_name' });
    throw error;
  }
}

// --- accounts ---------------------------------------------------------------------------------

interface AccountRow {
  id: number;
  name: string;
  type: AccountType;
  liquidity: Liquidity;
  initial_balance_minor: number;
  emergency_eligible: number;
  archived_at: string | null;
}

export interface NewAccount {
  readonly id?: AccountId;
  readonly name: string;
  readonly type: AccountType;
  readonly liquidity: Liquidity;
  readonly initialBalance: Money;
  readonly emergencyEligible: boolean;
}

const toAccount = (r: AccountRow): Account => ({
  id: r.id as AccountId,
  name: r.name,
  type: r.type,
  liquidity: r.liquidity,
  initialBalance: Money.ofMinor(r.initial_balance_minor),
  emergencyEligible: r.emergency_eligible === 1,
  archivedAt: r.archived_at,
});

export function accountsRepository(db: Db, now: Now) {
  const insert = db.prepare<unknown[], AccountRow>(
    `INSERT INTO accounts (id, name, type, liquidity, initial_balance_minor, emergency_eligible, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  );
  return {
    list: (opts: ListOptions = {}) =>
      db
        .prepare<[], AccountRow>(`SELECT * FROM accounts ${active(opts)} ORDER BY name`)
        .all()
        .map(toAccount),
    get: (id: AccountId) => {
      const row = db.prepare<[number], AccountRow>('SELECT * FROM accounts WHERE id = ?').get(id);
      return row ? toAccount(row) : undefined;
    },
    create: (a: NewAccount) =>
      tryInsert(() =>
        toAccount(
          insert.get(
            a.id ?? null,
            a.name.trim(),
            a.type,
            a.liquidity,
            a.initialBalance.minor,
            a.emergencyEligible ? 1 : 0,
            now(),
          ) as AccountRow,
        ),
      ),
    archive: (id: AccountId) =>
      db
        .prepare('UPDATE accounts SET archived_at = ? WHERE id = ? AND archived_at IS NULL')
        .run(now(), id).changes === 1,
  };
}

// --- categories -------------------------------------------------------------------------------

interface CategoryRow {
  id: number;
  name: string;
  archived_at: string | null;
}

const toCategory = (r: CategoryRow): Category => ({
  id: r.id as CategoryId,
  name: r.name,
  archivedAt: r.archived_at,
});

export function categoriesRepository(db: Db, now: Now) {
  const insert = db.prepare<unknown[], CategoryRow>(
    'INSERT INTO categories (id, name, created_at) VALUES (?, ?, ?) RETURNING *',
  );
  return {
    list: (opts: ListOptions = {}) =>
      db
        .prepare<[], CategoryRow>(`SELECT * FROM categories ${active(opts)} ORDER BY name`)
        .all()
        .map(toCategory),
    create: (c: { readonly id?: CategoryId; readonly name: string }) =>
      tryInsert(() => toCategory(insert.get(c.id ?? null, c.name.trim(), now()) as CategoryRow)),
    archive: (id: CategoryId) =>
      db
        .prepare('UPDATE categories SET archived_at = ? WHERE id = ? AND archived_at IS NULL')
        .run(now(), id).changes === 1,
  };
}

// --- liabilities ------------------------------------------------------------------------------

interface LiabilityRow {
  id: number;
  name: string;
  type: LiabilityType;
  opening_balance_minor: number;
  archived_at: string | null;
}

export interface NewLiability {
  readonly id?: LiabilityId;
  readonly name: string;
  readonly type: LiabilityType;
  readonly openingBalance: Money;
}

const toLiability = (r: LiabilityRow): Liability => ({
  id: r.id as LiabilityId,
  name: r.name,
  type: r.type,
  openingBalance: Money.ofMinor(r.opening_balance_minor),
  archivedAt: r.archived_at,
});

export function liabilitiesRepository(db: Db, now: Now) {
  const insert = db.prepare<unknown[], LiabilityRow>(
    `INSERT INTO liabilities (id, name, type, opening_balance_minor, created_at)
     VALUES (?, ?, ?, ?, ?) RETURNING *`,
  );
  return {
    list: (opts: ListOptions = {}) =>
      db
        .prepare<[], LiabilityRow>(`SELECT * FROM liabilities ${active(opts)} ORDER BY name`)
        .all()
        .map(toLiability),
    create: (l: NewLiability) =>
      tryInsert(() =>
        toLiability(
          insert.get(
            l.id ?? null,
            l.name.trim(),
            l.type,
            l.openingBalance.minor,
            now(),
          ) as LiabilityRow,
        ),
      ),
    archive: (id: LiabilityId) =>
      db
        .prepare('UPDATE liabilities SET archived_at = ? WHERE id = ? AND archived_at IS NULL')
        .run(now(), id).changes === 1,
  };
}

// --- goals ------------------------------------------------------------------------------------

interface GoalRow {
  id: number;
  name: string;
  target_minor: number;
  target_date: string | null;
  account_id: number | null;
  archived_at: string | null;
}

export interface NewGoal {
  readonly id?: GoalId;
  readonly name: string;
  readonly target: Money;
  readonly targetDate: LocalDate | null;
  readonly accountId: AccountId | null;
}

const toGoal = (r: GoalRow): Goal => ({
  id: r.id as GoalId,
  name: r.name,
  target: Money.ofMinor(r.target_minor),
  targetDate: r.target_date as LocalDate | null,
  accountId: r.account_id as AccountId | null,
  archivedAt: r.archived_at,
});

export function goalsRepository(db: Db, now: Now) {
  const insert = db.prepare<unknown[], GoalRow>(
    `INSERT INTO goals (id, name, target_minor, target_date, account_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
  );
  return {
    list: (opts: ListOptions = {}) =>
      db
        .prepare<[], GoalRow>(`SELECT * FROM goals ${active(opts)} ORDER BY name`)
        .all()
        .map(toGoal),
    create: (g: NewGoal) =>
      tryInsert(() =>
        toGoal(
          insert.get(
            g.id ?? null,
            g.name.trim(),
            g.target.minor,
            g.targetDate,
            g.accountId,
            now(),
          ) as GoalRow,
        ),
      ),
    archive: (id: GoalId) =>
      db
        .prepare('UPDATE goals SET archived_at = ? WHERE id = ? AND archived_at IS NULL')
        .run(now(), id).changes === 1,
  };
}
