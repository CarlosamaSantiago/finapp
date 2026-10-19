import { parseAmountInput } from '@finapp/contracts';
import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatMoney,
  formatMonth,
  shiftMonth,
  toAmountInput,
  today,
} from './format.js';
import { errorMessages } from './i18n.js';

// Intl output contains non-breaking spaces; normalize them for readable expectations.
const plain = (s: string) => s.replace(/\s/g, ' ');

describe('formatMoney', () => {
  it.each([
    [0, '$ 0'],
    [125_000_000, '$ 1.250.000'],
    [125_000_050, '$ 1.250.000,50'],
    [5, '$ 0,05'],
    [-1_205_050, '-$ 12.050,50'],
    [Number.MAX_SAFE_INTEGER, '$ 90.071.992.547.409,91'],
  ])('%d -> %s', (minor, text) => {
    expect(plain(formatMoney(minor))).toBe(text);
  });

  it('round-trips through the es-CO input parser', () => {
    for (const minor of [0, 1, 99, 100, 125_000_050, 987_654_321]) {
      expect(parseAmountInput(toAmountInput(minor))).toBe(minor);
    }
  });
});

describe('dates', () => {
  it('formats calendar dates without shifting the day', () => {
    expect(plain(formatDate('2026-10-01'))).toMatch(/^1 de oct\.? de 2026$/);
    expect(formatMonth('2026-01')).toBe('enero de 2026');
  });

  it('shifts months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', -14)).toBe('2025-08');
  });

  it('uses the local calendar date', () => {
    expect(today(new Date(2026, 9, 9, 23, 59))).toBe('2026-10-09');
  });
});

describe('errorMessages', () => {
  it('translates ledger error codes with field names', () => {
    expect(
      errorMessages({
        error: 'ledger_rejected',
        details: [{ code: 'missing_field', field: 'categoryId' }, { code: 'amount_not_positive' }],
      }),
    ).toEqual(['Falta la categoría.', 'El monto debe ser mayor que cero.']);
  });

  it('falls back to a generic message for unknown codes', () => {
    expect(errorMessages({ error: 'something_new' })).toEqual(['Ocurrió un error inesperado.']);
    expect(errorMessages({ error: 'wrong_passphrase' })).toEqual([
      'La frase de acceso no es correcta.',
    ]);
  });
});
