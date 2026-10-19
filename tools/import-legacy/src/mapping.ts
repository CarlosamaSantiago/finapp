import {
  Money,
  parseLocalDate,
  type AccountType,
  type EntryKind,
  type LiabilityType,
  type Liquidity,
  type LocalDate,
} from '@finapp/domain';

/** Lowercase, no accents, single spaces, underscores as spaces: `'Tarjeta de Crédito'` -> `'tarjeta de credito'`. */
export const normalize = (value: unknown): string =>
  (typeof value === 'string' ? value : String(value))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Legacy free-text labels -> new enums. Extend these tables when the import reports an unknown value. */
export const ACCOUNT_TYPE: Readonly<Record<string, AccountType>> = {
  ahorros: 'savings',
  ahorro: 'savings',
  'cuenta de ahorros': 'savings',
  corriente: 'checking',
  'cuenta corriente': 'checking',
  efectivo: 'cash',
  cdt: 'term_deposit',
  inversion: 'investment',
  inversiones: 'investment',
  'cuenta por cobrar': 'receivable',
  'por cobrar': 'receivable',
  'cuentas por cobrar': 'receivable',
  otro: 'other',
  otra: 'other',
};

export const LIQUIDITY: Readonly<Record<string, Liquidity>> = {
  inmediata: 'immediate',
  'entre 1 y 6 meses': 'short_term',
  'menos de 6 meses': 'short_term',
  'mas de 6 meses': 'long_term',
  'mayor a 6 meses': 'long_term',
};

export const LIABILITY_TYPE: Readonly<Record<string, LiabilityType>> = {
  'tarjeta de credito': 'credit_card',
  prestamo: 'loan',
  credito: 'loan',
  'credito de libre inversion': 'loan',
  'credito vehicular': 'vehicle_loan',
  vehiculo: 'vehicle_loan',
  hipoteca: 'mortgage',
  'credito hipotecario': 'mortgage',
  otro: 'other',
  otra: 'other',
};

/** ADR 0002: `ahorro` is a transfer between own accounts. */
export const ENTRY_KIND: Readonly<Record<string, EntryKind>> = {
  ingreso: 'income',
  gasto: 'expense',
  transferencia: 'transfer',
  ahorro: 'transfer',
  'aporte meta': 'goal_contribution',
  'pago deuda': 'debt_payment',
  'ajuste saldo': 'adjustment',
};

/** Collects problems instead of failing on the first one, so a single run lists everything to fix. */
export class Issues {
  readonly unknownValues = new Map<string, Set<string>>();
  readonly rowProblems: string[] = [];

  unknown(field: string, value: unknown): void {
    const set = this.unknownValues.get(field) ?? new Set<string>();
    set.add(normalize(value));
    this.unknownValues.set(field, set);
  }

  row(table: string, id: unknown, problem: string): void {
    this.rowProblems.push(`${table} ${String(id)}: ${problem}`);
  }

  get count(): number {
    return this.unknownValues.size + this.rowProblems.length;
  }
}

export function mapEnum<T>(
  table: Readonly<Record<string, T>>,
  value: unknown,
  field: string,
  issues: Issues,
): T | undefined {
  const mapped = table[normalize(value)];
  if (mapped === undefined) issues.unknown(field, value);
  return mapped;
}

/** Legacy money is a decimal string such as `'14000.00'`. `null` counts as zero only where allowed. */
export function money(
  value: unknown,
  where: [table: string, id: unknown, column: string],
  issues: Issues,
  { nullIsZero = false } = {},
): Money {
  if (value === null || value === undefined || value === '') {
    if (!nullIsZero) issues.row(where[0], where[1], `${where[2]} is empty`);
    return Money.zero;
  }
  const text =
    typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  const parsed = Money.fromDecimalString(text);
  if (!parsed.ok) {
    issues.row(where[0], where[1], `${where[2]} is not an exact decimal amount`);
    return Money.zero;
  }
  return parsed.value;
}

export function date(value: unknown): LocalDate | null {
  if (typeof value !== 'string' || value === '') return null;
  const parsed = parseLocalDate(value.slice(0, 10));
  return parsed.ok ? parsed.value : null;
}

export const flag = (value: unknown): boolean => value === 1 || value === '1' || value === true;

export const optionalId = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value);
