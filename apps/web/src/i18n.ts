import type {
  AccountType,
  EntryKind,
  ErrorBody,
  LiabilityType,
  Liquidity,
} from '@finapp/contracts';

/** User-facing strings (es-CO). Code and identifiers stay in English (CLAUDE.md). */
export const KIND_LABEL: Record<EntryKind, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
  goal_contribution: 'Aporte a meta',
  debt_payment: 'Pago de deuda',
  adjustment: 'Ajuste de saldo',
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: 'Cuenta corriente',
  savings: 'Cuenta de ahorros',
  cash: 'Efectivo',
  term_deposit: 'CDT',
  investment: 'Inversión',
  receivable: 'Cuenta por cobrar',
  other: 'Otra',
};

export const LIQUIDITY_LABEL: Record<Liquidity, string> = {
  immediate: 'Inmediata',
  short_term: 'Hasta 6 meses',
  long_term: 'Más de 6 meses',
};

export const LIABILITY_TYPE_LABEL: Record<LiabilityType, string> = {
  credit_card: 'Tarjeta de crédito',
  loan: 'Préstamo',
  vehicle_loan: 'Crédito vehicular',
  mortgage: 'Crédito hipotecario',
  other: 'Otra',
};

const FIELD_LABEL: Record<string, string> = {
  sourceAccountId: 'la cuenta de origen',
  destinationAccountId: 'la cuenta de destino',
  categoryId: 'la categoría',
  goalId: 'la meta',
  liabilityId: 'la deuda',
};

const field = (name: string | undefined) => (name && FIELD_LABEL[name]) ?? 'un campo';

const DETAIL: Record<string, (fieldName?: string) => string> = {
  missing_field: (f) => `Falta ${field(f)}.`,
  forbidden_field: (f) => `${capitalize(field(f))} no aplica a este tipo de movimiento.`,
  unknown_reference: (f) => `${capitalize(field(f))} no existe o está archivada.`,
  amount_not_positive: () => 'El monto debe ser mayor que cero.',
  interest_out_of_range: () => 'Los intereses deben estar entre cero y el monto.',
  same_account: () => 'Las cuentas de origen y destino deben ser distintas.',
  adjustment_needs_one_side: () => 'Un ajuste afecta una sola cuenta.',
  note_required: () => 'Escribe el motivo del ajuste.',
  already_reversed: () => 'Este movimiento ya fue reversado.',
  reversal_of_reversal: () => 'No se puede reversar una reversión.',
  reversal_before_original: () => 'La reversión no puede tener fecha anterior al movimiento.',
  reversal_mismatch: () => 'La reversión no coincide con el movimiento original.',
  reversal_target_not_found: () => 'El movimiento a reversar no existe.',
  duplicate_id: () => 'El movimiento ya existe.',
};

const ERROR: Record<string, string> = {
  duplicate_name: 'Ya existe un registro con ese nombre.',
  wrong_passphrase: 'La frase de acceso no es correcta.',
  too_many_attempts: 'Demasiados intentos fallidos. Espera un momento e inténtalo de nuevo.',
  too_many_requests: 'Demasiadas solicitudes. Espera un momento.',
  validation_failed: 'Revisa los datos del formulario.',
  already_initialized: 'La aplicación ya fue configurada.',
  unauthenticated: 'Tu sesión terminó. Vuelve a ingresar.',
  not_found: 'No se encontró el registro.',
  network: 'No se pudo conectar con el servidor. ¿Está corriendo la API?',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Turns an API error body into sentences for the user. */
export function errorMessages(body: ErrorBody): string[] {
  if (body.error === 'ledger_rejected' && body.details?.length) {
    return body.details.map((d) => DETAIL[d.code]?.(d.field) ?? 'El movimiento no es válido.');
  }
  return [ERROR[body.error] ?? 'Ocurrió un error inesperado.'];
}
