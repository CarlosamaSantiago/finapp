import {
  accountsRepository,
  ledgerRepository,
  liabilitiesRepository,
  type Db,
  type Now,
} from '@finapp/db';
import {
  Money,
  accountBalance,
  liabilityBalance,
  monthlyTotals,
  type YearMonth,
} from '@finapp/domain';
import type { LegacyData } from './legacy.js';
import { Issues, money, normalize, optionalId } from './mapping.js';

export interface Check {
  readonly checked: number;
  /** Ids (accounts, liabilities) or months that differ. Never amounts (CLAUDE.md logging rule). */
  readonly mismatches: readonly string[];
}

export interface GoldenReport {
  readonly passed: boolean;
  readonly accounts: Check;
  readonly liabilities: Check;
  readonly months: Check;
}

/**
 * The M2 acceptance test (REVERSE_ENGINEERING.md §6): figures recomputed straight from the legacy rows
 * must equal what the domain derives from the imported ledger, to the cent.
 */
export function goldenCheck(legacy: LegacyData, target: Db, now: Now): GoldenReport {
  const issues = new Issues(); // values were already validated by the import
  const amount = (t: Record<string, unknown>) =>
    money(t.amount, ['transactions', t.id, 'amount'], issues);
  const entries = ledgerRepository(target, now).list();

  // Legacy rule (REVERSE_ENGINEERING.md §4.3): initial balance + inflows - outflows.
  const accounts = accountsRepository(target, now).list({ includeArchived: true });
  const accountMismatches = legacy.accounts
    .filter((a) => {
      const id = Number(a.id);
      const expected = legacy.transactions.reduce(
        (sum, t) =>
          sum
            .add(optionalId(t.destination_account_id) === id ? amount(t) : Money.zero)
            .subtract(optionalId(t.source_account_id) === id ? amount(t) : Money.zero),
        money(a.initial_balance, ['accounts', a.id, 'initial_balance'], issues),
      );
      const account = accounts.find((x) => x.id === id);
      return !account || !accountBalance(account, entries).equals(expected);
    })
    .map((a) => `account ${String(a.id)}`);

  // The legacy app cached the liability balance in current_balance (§4.2).
  const liabilities = liabilitiesRepository(target, now).list({ includeArchived: true });
  const liabilityMismatches = legacy.liabilities
    .filter((l) => {
      const liability = liabilities.find((x) => x.id === Number(l.id));
      const expected = money(l.current_balance, ['liabilities', l.id, 'current_balance'], issues);
      return !liability || !liabilityBalance(liability, entries).equals(expected);
    })
    .map((l) => `liability ${String(l.id)}`);

  const legacyMonths = new Map<string, { income: Money; expense: Money }>();
  for (const t of legacy.transactions) {
    const type = normalize(t.transaction_type);
    if (type !== 'ingreso' && type !== 'gasto') continue;
    const month = String(t.transaction_date).slice(0, 7);
    const current = legacyMonths.get(month) ?? { income: Money.zero, expense: Money.zero };
    legacyMonths.set(
      month,
      type === 'ingreso'
        ? { ...current, income: current.income.add(amount(t)) }
        : { ...current, expense: current.expense.add(amount(t)) },
    );
  }
  const derived = monthlyTotals(entries);
  const months = new Set([...legacyMonths.keys(), ...derived.keys()]);
  const monthMismatches = [...months]
    .filter((month) => {
      const a = legacyMonths.get(month);
      const b = derived.get(month as YearMonth);
      return !a || !b || !a.income.equals(b.income) || !a.expense.equals(b.expense);
    })
    .sort()
    .map((month) => `month ${month}`);

  return {
    passed:
      accountMismatches.length + liabilityMismatches.length + monthMismatches.length === 0 &&
      issues.count === 0,
    accounts: { checked: legacy.accounts.length, mismatches: accountMismatches },
    liabilities: { checked: legacy.liabilities.length, mismatches: liabilityMismatches },
    months: { checked: months.size, mismatches: monthMismatches },
  };
}
