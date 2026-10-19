import { Money, type EntryKind, type LedgerEntry, type LocalDate } from '@finapp/domain';
import type { Db } from './connection.js';
import { ledgerRepository } from './ledger.js';
import {
  accountsRepository,
  categoriesRepository,
  goalsRepository,
  liabilitiesRepository,
  type Now,
} from './master-data.js';

const pesos = (n: number) => Money.ofMinor(n * 100);

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`Seed data is invalid: ${JSON.stringify(result.error)}`);
  return result.value;
}

/** `YYYY-MM-DD` for `day` of the month `monthsBack` months before `today`. */
function dateIn(today: LocalDate, monthsBack: number, day: number): LocalDate {
  const index = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1 - monthsBack;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as LocalDate;
}

/**
 * Fills an empty store with synthetic data for demos, screenshots and manual testing. Never real data
 * (CLAUDE.md). Covers every entry kind over the last three months.
 */
export function seedSynthetic(db: Db, now: Now, today: LocalDate): void {
  const accounts = accountsRepository(db, now);
  const categories = categoriesRepository(db, now);
  const ledger = ledgerRepository(db, now);

  db.transaction(() => {
    const savings = unwrap(
      accounts.create({
        name: 'Cuenta de ahorros',
        type: 'savings',
        liquidity: 'immediate',
        initialBalance: pesos(2_500_000),
        emergencyEligible: true,
      }),
    );
    const wallet = unwrap(
      accounts.create({
        name: 'Billetera',
        type: 'cash',
        liquidity: 'immediate',
        initialBalance: pesos(150_000),
        emergencyEligible: false,
      }),
    );
    const deposit = unwrap(
      accounts.create({
        name: 'CDT 90 días',
        type: 'term_deposit',
        liquidity: 'short_term',
        initialBalance: pesos(4_000_000),
        emergencyEligible: false,
      }),
    );
    const [salary, groceries, transport, utilities, debt, saving] = [
      'Salario',
      'Mercado',
      'Transporte',
      'Servicios',
      'Deudas',
      'Ahorro',
    ].map((name) => unwrap(categories.create({ name })));
    const card = unwrap(
      liabilitiesRepository(db, now).create({
        name: 'Tarjeta de crédito',
        type: 'credit_card',
        openingBalance: pesos(1_200_000),
      }),
    );
    const fund = unwrap(
      goalsRepository(db, now).create({
        name: 'Fondo de emergencia',
        target: pesos(6_000_000),
        targetDate: null,
        accountId: savings.id,
      }),
    );

    let n = 0;
    const add = (
      kind: EntryKind,
      fields: Partial<LedgerEntry>,
      monthsBack: number,
      day: number,
    ) => {
      n += 1;
      unwrap(
        ledger.append(
          {
            occurredOn: dateIn(today, monthsBack, day),
            kind,
            amount: Money.zero,
            interest: Money.zero,
            categoryId: null,
            sourceAccountId: null,
            destinationAccountId: null,
            goalId: null,
            liabilityId: null,
            reversesEntryId: null,
            note: null,
            ...fields,
          },
          `seed-${String(n)}`,
        ),
      );
    };

    for (const monthsBack of [2, 1, 0]) {
      add(
        'income',
        {
          amount: pesos(4_200_000),
          destinationAccountId: savings.id,
          categoryId: salary?.id ?? null,
        },
        monthsBack,
        1,
      );
      add(
        'transfer',
        { amount: pesos(300_000), sourceAccountId: savings.id, destinationAccountId: wallet.id },
        monthsBack,
        2,
      );
      add(
        'expense',
        { amount: pesos(620_000), sourceAccountId: savings.id, categoryId: groceries?.id ?? null },
        monthsBack,
        5,
      );
      add(
        'expense',
        { amount: pesos(180_000), sourceAccountId: wallet.id, categoryId: transport?.id ?? null },
        monthsBack,
        9,
      );
      add(
        'expense',
        { amount: pesos(240_000), sourceAccountId: savings.id, categoryId: utilities?.id ?? null },
        monthsBack,
        12,
      );
      add(
        'debt_payment',
        {
          amount: pesos(350_000),
          interest: pesos(42_000),
          sourceAccountId: savings.id,
          categoryId: debt?.id ?? null,
          liabilityId: card.id,
        },
        monthsBack,
        15,
      );
      add(
        'goal_contribution',
        {
          amount: pesos(400_000),
          sourceAccountId: savings.id,
          categoryId: saving?.id ?? null,
          goalId: fund.id,
        },
        monthsBack,
        16,
      );
    }
    add(
      'transfer',
      { amount: pesos(1_000_000), sourceAccountId: savings.id, destinationAccountId: deposit.id },
      1,
      20,
    );
    add(
      'adjustment',
      { amount: pesos(12_500), destinationAccountId: wallet.id, note: 'Diferencia de arqueo' },
      0,
      3,
    );
  })();
}
