import { describe, expect, it } from 'vitest';
import { accountId, categoryId, entryId, goalId, liabilityId } from './ids.js';

describe('id constructors', () => {
  it.each([
    ['accountId', accountId],
    ['categoryId', categoryId],
    ['entryId', entryId],
    ['goalId', goalId],
    ['liabilityId', liabilityId],
  ])('%s accepts positive integers', (_name, make) => {
    expect(make(1)).toBe(1);
  });

  it.each([0, -1, 1.5, Number.NaN, 2 ** 53])('reject %d', (n) => {
    expect(() => accountId(n)).toThrow(RangeError);
  });
});
