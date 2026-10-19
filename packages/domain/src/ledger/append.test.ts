import { describe, expect, it } from 'vitest';
import type { LocalDate } from '../dates.js';
import { entryId } from '../ids.js';
import { Money } from '../money.js';
import { A2, entry } from '../testing/builders.js';
import { reverse, validateAppend, type AppendError } from './append.js';

const date = (s: string) => s as LocalDate;
const errorsOf = (...args: Parameters<typeof validateAppend>): readonly AppendError[] => {
  const result = validateAppend(...args);
  return result.ok ? [] : result.error;
};

const original = entry('expense', { id: 1, occurredOn: date('2026-10-01') });
const reversal = reverse(original, { id: entryId(2), occurredOn: date('2026-10-05'), note: null });

describe('validateAppend', () => {
  it('accepts a valid entry on an empty ledger', () => {
    expect(errorsOf(original, [])).toEqual([]);
  });

  it('includes single-entry rule violations', () => {
    expect(errorsOf(entry('expense', { minor: 0 }), [])).toEqual([{ code: 'amount_not_positive' }]);
  });

  it('rejects a duplicate id', () => {
    expect(errorsOf(entry('income', { id: 1 }), [original])).toEqual([{ code: 'duplicate_id' }]);
  });
});

describe('reversals', () => {
  it('reverse copies the original and points at it', () => {
    expect(reversal).toMatchObject({
      kind: original.kind,
      amount: original.amount,
      sourceAccountId: original.sourceAccountId,
      categoryId: original.categoryId,
      reversesEntryId: original.id,
      occurredOn: '2026-10-05',
    });
  });

  it('accepts a reversal of an existing entry', () => {
    expect(errorsOf(reversal, [original])).toEqual([]);
  });

  it('accepts a reversal on the same day', () => {
    expect(errorsOf({ ...reversal, occurredOn: original.occurredOn }, [original])).toEqual([]);
  });

  it('rejects a reversal whose target does not exist', () => {
    expect(errorsOf(reversal, [])).toEqual([{ code: 'reversal_target_not_found' }]);
  });

  it('rejects reversing the same entry twice', () => {
    const second = { ...reversal, id: entryId(3) };
    expect(errorsOf(second, [original, reversal])).toEqual([{ code: 'already_reversed' }]);
  });

  it('rejects reversing a reversal', () => {
    const undo = reverse(reversal, { id: entryId(3), occurredOn: date('2026-10-06'), note: null });
    expect(errorsOf(undo, [original, reversal])).toEqual([{ code: 'reversal_of_reversal' }]);
  });

  it.each([
    ['amount', { amount: Money.ofMinor(1) }],
    ['account', { sourceAccountId: A2 }],
    ['kind', { kind: 'transfer' as const, destinationAccountId: A2 }],
  ])('rejects a reversal with a different %s', (_name, change) => {
    expect(errorsOf({ ...reversal, ...change }, [original])).toEqual([
      { code: 'reversal_mismatch' },
    ]);
  });

  it('rejects a reversal dated before the original', () => {
    expect(errorsOf({ ...reversal, occurredOn: date('2026-09-30') }, [original])).toEqual([
      { code: 'reversal_before_original' },
    ]);
  });
});
