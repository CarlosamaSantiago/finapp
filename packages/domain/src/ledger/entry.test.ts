import { describe, expect, it } from 'vitest';
import { Money } from '../money.js';
import { A1, A2, C1, G1, L1, entry } from '../testing/builders.js';
import { ENTRY_KINDS, principalOf, validateEntry, type EntryError } from './entry.js';

const errorsOf = (e: Parameters<typeof validateEntry>[0]): readonly EntryError[] => {
  const result = validateEntry(e);
  return result.ok ? [] : result.error;
};

describe('validateEntry', () => {
  it.each(ENTRY_KINDS)('accepts a valid %s', (kind) => {
    expect(errorsOf(entry(kind))).toEqual([]);
  });

  it.each([
    ['income', 'destinationAccountId'],
    ['income', 'categoryId'],
    ['expense', 'sourceAccountId'],
    ['expense', 'categoryId'],
    ['transfer', 'sourceAccountId'],
    ['transfer', 'destinationAccountId'],
    ['goal_contribution', 'goalId'],
    ['debt_payment', 'liabilityId'],
  ] as const)('%s requires %s', (kind, field) => {
    expect(errorsOf(entry(kind, { [field]: null }))).toContainEqual({
      code: 'missing_field',
      field,
    });
  });

  it.each([
    ['income', { sourceAccountId: A2 }, 'sourceAccountId'],
    ['expense', { destinationAccountId: A2 }, 'destinationAccountId'],
    ['expense', { goalId: G1 }, 'goalId'],
    ['transfer', { liabilityId: L1 }, 'liabilityId'],
    ['adjustment', { categoryId: C1 }, 'categoryId'],
  ] as const)('%s forbids %o', (kind, extra, field) => {
    expect(errorsOf(entry(kind, extra))).toContainEqual({ code: 'forbidden_field', field });
  });

  it('allows a transfer with or without a category', () => {
    expect(errorsOf(entry('transfer', { categoryId: C1 }))).toEqual([]);
  });

  it.each([0, -1])('rejects amount %d', (minor) => {
    expect(errorsOf(entry('expense', { minor }))).toContainEqual({ code: 'amount_not_positive' });
  });

  it('rejects a transfer to the same account', () => {
    expect(errorsOf(entry('transfer', { destinationAccountId: A1 }))).toEqual([
      { code: 'same_account' },
    ]);
  });

  describe('interest', () => {
    const debt = (interest: number) =>
      entry('debt_payment', { minor: 1000, interest: Money.ofMinor(interest) });

    it.each([0, 1, 1000])('allows %d on a 1000 debt payment', (interest) => {
      expect(errorsOf(debt(interest))).toEqual([]);
    });

    it.each([-1, 1001])('rejects %d on a 1000 debt payment', (interest) => {
      expect(errorsOf(debt(interest))).toEqual([{ code: 'interest_out_of_range' }]);
    });

    it('rejects interest on other kinds', () => {
      expect(errorsOf(entry('expense', { interest: Money.ofMinor(1) }))).toEqual([
        { code: 'interest_out_of_range' },
      ]);
    });

    it('principal is amount minus interest', () => {
      expect(principalOf(debt(250)).minor).toBe(750);
    });
  });

  describe('adjustment', () => {
    it('may debit instead of credit', () => {
      expect(
        errorsOf(entry('adjustment', { destinationAccountId: null, sourceAccountId: A1 })),
      ).toEqual([]);
    });

    it('needs exactly one side', () => {
      expect(errorsOf(entry('adjustment', { destinationAccountId: null }))).toEqual([
        { code: 'adjustment_needs_one_side' },
      ]);
      expect(errorsOf(entry('adjustment', { sourceAccountId: A2 }))).toEqual([
        { code: 'adjustment_needs_one_side' },
      ]);
    });

    it.each([null, '', '   '])('requires a reason (note %j)', (note) => {
      expect(errorsOf(entry('adjustment', { note }))).toEqual([{ code: 'note_required' }]);
    });
  });

  it('reports every violation at once', () => {
    expect(
      errorsOf(entry('income', { destinationAccountId: null, categoryId: null, minor: 0 })),
    ).toHaveLength(3);
  });
});
