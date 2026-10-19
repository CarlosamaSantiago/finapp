import {
  accountsRepository,
  categoriesRepository,
  goalsRepository,
  ledgerRepository,
  liabilitiesRepository,
  type Db,
  type Now,
} from '@finapp/db';
import type { AccountId, CategoryId, GoalId, LiabilityId, Money } from '@finapp/domain';
import type { LegacyData } from './legacy.js';
import {
  ACCOUNT_TYPE,
  ENTRY_KIND,
  Issues,
  LIABILITY_TYPE,
  LIQUIDITY,
  date,
  flag,
  mapEnum,
  money,
  normalize,
  optionalId,
} from './mapping.js';

export interface ImportCounts {
  readonly accounts: number;
  readonly categories: number;
  readonly liabilities: number;
  readonly goals: number;
  readonly entries: number;
}

export type ImportResult =
  | { readonly ok: true; readonly counts: ImportCounts }
  | { readonly ok: false; readonly issues: Issues };

const ADJUSTMENT_NOTE = 'Ajuste de saldo importado';

/**
 * Copies legacy data into an empty, migrated store in one transaction. Ids of accounts, liabilities and
 * goals are kept; categories with the same name are merged. On any issue nothing is written.
 */
export function importLegacy(legacy: LegacyData, target: Db, now: Now): ImportResult {
  const issues = new Issues();
  const accounts = accountsRepository(target, now);
  const categories = categoriesRepository(target, now);
  const liabilities = liabilitiesRepository(target, now);
  const goals = goalsRepository(target, now);
  const ledger = ledgerRepository(target, now);

  const run = target.transaction((): ImportCounts => {
    for (const a of legacy.accounts) {
      const type = mapEnum(ACCOUNT_TYPE, a.account_type, 'accounts.account_type', issues);
      const liquidity = mapEnum(LIQUIDITY, a.liquidity, 'accounts.liquidity', issues);
      const initialBalance = money(
        a.initial_balance,
        ['accounts', a.id, 'initial_balance'],
        issues,
      );
      if (!type || !liquidity) continue;
      const created = accounts.create({
        id: Number(a.id) as AccountId,
        name: String(a.name),
        type,
        liquidity,
        initialBalance,
        emergencyEligible: flag(a.is_emergency_eligible),
      });
      if (!created.ok) issues.row('accounts', a.id, created.error.code);
    }

    const categoryIds = new Map<number, CategoryId>();
    const byName = new Map<string, CategoryId>();
    for (const c of legacy.categories) {
      const key = normalize(c.name);
      let id = byName.get(key);
      if (id === undefined) {
        const created = categories.create({ name: String(c.name) });
        if (!created.ok) {
          issues.row('categories', c.id, created.error.code);
          continue;
        }
        id = created.value.id;
        byName.set(key, id);
      }
      categoryIds.set(Number(c.id), id);
    }

    for (const l of legacy.liabilities) {
      const type = mapEnum(LIABILITY_TYPE, l.liability_type, 'liabilities.liability_type', issues);
      const openingBalance = money(
        l.opening_balance,
        ['liabilities', l.id, 'opening_balance'],
        issues,
      );
      if (!type) continue;
      const created = liabilities.create({
        id: Number(l.id) as LiabilityId,
        name: String(l.name),
        type,
        openingBalance,
      });
      if (!created.ok) issues.row('liabilities', l.id, created.error.code);
    }

    for (const g of legacy.goals) {
      const target = money(g.target_amount, ['goals', g.id, 'target_amount'], issues);
      if (!target.isPositive()) {
        issues.row('goals', g.id, 'target_amount must be positive');
        continue;
      }
      const created = goals.create({
        id: Number(g.id) as GoalId,
        name: String(g.name),
        target,
        targetDate: date(g.target_date),
        accountId: optionalId(g.account_id) as AccountId | null,
      });
      if (!created.ok) issues.row('goals', g.id, created.error.code);
    }

    // Still map every transaction (to list all problems) but skip appends that would only cascade.
    const masterDataFailed = issues.count > 0;
    let entries = 0;
    for (const t of legacy.transactions) {
      const before = issues.count;
      const kind = mapEnum(ENTRY_KIND, t.transaction_type, 'transactions.transaction_type', issues);
      const occurredOn = date(t.transaction_date);
      const amount: Money = money(t.amount, ['transactions', t.id, 'amount'], issues);
      const interest = money(t.interest_amount, ['transactions', t.id, 'interest_amount'], issues, {
        nullIsZero: true,
      });
      if (!occurredOn) issues.row('transactions', t.id, 'transaction_date is not YYYY-MM-DD');
      if (!kind || !occurredOn || masterDataFailed || issues.count > before) continue;

      const legacyCategory = optionalId(t.category_id);
      const result = ledger.append(
        {
          occurredOn,
          kind,
          amount,
          interest,
          // Adjustments carry no category in the new model (ADR 0002).
          categoryId:
            kind === 'adjustment' || legacyCategory === null
              ? null
              : (categoryIds.get(legacyCategory) ?? null),
          sourceAccountId: optionalId(t.source_account_id) as AccountId | null,
          destinationAccountId: optionalId(t.destination_account_id) as AccountId | null,
          goalId: optionalId(t.goal_id) as GoalId | null,
          liabilityId: optionalId(t.liability_id) as LiabilityId | null,
          reversesEntryId: null,
          note: kind === 'adjustment' ? ADJUSTMENT_NOTE : null,
        },
        String(t.request_id),
      );
      if (result.ok) entries += 1;
      else
        issues.row(
          'transactions',
          t.id,
          result.error.map((e) => ('field' in e ? `${e.code}(${e.field})` : e.code)).join(', '),
        );
    }

    // Archive last, so entries that reference inactive master data could still be imported.
    for (const a of legacy.accounts)
      if (!flag(a.is_active)) accounts.archive(Number(a.id) as AccountId);
    for (const l of legacy.liabilities) {
      if (!flag(l.is_active)) liabilities.archive(Number(l.id) as LiabilityId);
    }
    for (const c of legacy.categories) {
      const id = categoryIds.get(Number(c.id));
      const stillUsedActive = legacy.categories.some(
        (other) => flag(other.is_active) && categoryIds.get(Number(other.id)) === id,
      );
      if (id !== undefined && !flag(c.is_active) && !stillUsedActive) categories.archive(id);
    }

    if (issues.count > 0) throw new AbortImport();
    return {
      accounts: legacy.accounts.length,
      categories: byName.size,
      liabilities: legacy.liabilities.length,
      goals: legacy.goals.length,
      entries,
    };
  });

  try {
    return { ok: true, counts: run() };
  } catch (error) {
    if (error instanceof AbortImport) return { ok: false, issues };
    throw error;
  }
}

/** Thrown inside the transaction to roll everything back when issues were found. */
class AbortImport extends Error {}
