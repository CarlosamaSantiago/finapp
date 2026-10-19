import type { Db } from '@finapp/db';

/** Raw rows from the legacy Python app (docs/REVERSE_ENGINEERING.md §2). Values are not trusted yet. */
export type Raw = Record<string, unknown>;

export interface LegacyData {
  readonly accounts: Raw[];
  readonly categories: Raw[];
  readonly liabilities: Raw[];
  readonly goals: Raw[];
  readonly transactions: Raw[];
  /** Row counts of phase-2 tables that are not imported. */
  readonly skipped: Record<string, number>;
}

const REQUIRED: Record<string, readonly string[]> = {
  accounts: [
    'id',
    'name',
    'account_type',
    'liquidity',
    'initial_balance',
    'is_active',
    'is_emergency_eligible',
  ],
  categories: ['id', 'name', 'is_active'],
  liabilities: ['id', 'name', 'liability_type', 'opening_balance', 'current_balance', 'is_active'],
  goals: ['id', 'name', 'target_amount', 'target_date', 'account_id'],
  transactions: [
    'id',
    'transaction_date',
    'transaction_type',
    'amount',
    'interest_amount',
    'request_id',
    'category_id',
    'source_account_id',
    'destination_account_id',
    'goal_id',
    'liability_id',
  ],
};

const PHASE_2 = [
  'budgets',
  'recurring_transactions',
  'one_time_obligations',
  'monthly_closings',
  'purchase_scenarios',
] as const;

export class LegacySchemaError extends Error {
  constructor(problems: string[]) {
    super(`Legacy database does not have the expected schema:\n  ${problems.join('\n  ')}`);
    this.name = 'LegacySchemaError';
  }
}

/** Reads every table the importer needs, after checking that the expected columns exist. */
export function readLegacy(db: Db): LegacyData {
  const tables = new Set(
    db.prepare<[], string>("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all(),
  );
  const problems: string[] = [];
  for (const [table, columns] of Object.entries(REQUIRED)) {
    if (!tables.has(table)) {
      problems.push(`missing table ${table}`);
      continue;
    }
    const present = new Set(
      db.prepare<[], string>(`SELECT name FROM pragma_table_info('${table}')`).pluck().all(),
    );
    for (const column of columns) {
      if (!present.has(column)) problems.push(`missing column ${table}.${column}`);
    }
  }
  if (problems.length > 0) throw new LegacySchemaError(problems);

  const all = (table: string) => db.prepare<[], Raw>(`SELECT * FROM ${table} ORDER BY id`).all();
  return {
    accounts: all('accounts'),
    categories: all('categories'),
    liabilities: all('liabilities'),
    goals: all('goals'),
    transactions: db
      .prepare<[], Raw>('SELECT * FROM transactions ORDER BY transaction_date, id')
      .all(),
    skipped: Object.fromEntries(
      PHASE_2.filter((t) => tables.has(t)).map((t) => [
        t,
        db.prepare<[], number>(`SELECT count(*) FROM ${t}`).pluck().get() ?? 0,
      ]),
    ),
  };
}
