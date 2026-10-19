import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Money } from './money.js';

const LIMIT = 2 ** 40; // far below MAX_SAFE_INTEGER, so sums of a few values never overflow
const money = fc.integer({ min: -LIMIT, max: LIMIT }).map((n) => Money.ofMinor(n));

const parse = (s: string) => {
  const result = Money.fromDecimalString(s);
  if (!result.ok) throw new Error(`expected ${s} to parse`);
  return result.value;
};

describe('Money.fromDecimalString', () => {
  it.each([
    ['0', 0],
    ['1250', 125000],
    ['1250.5', 125050],
    ['1250.05', 125005],
    ['-1250.00', -125000],
    ['007.10', 710],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ])('parses %s as %d minor units', (input, minor) => {
    expect(parse(input).minor).toBe(minor);
  });

  it.each(['', '1.234', '1,50', '1e3', '+5', ' 5', '5.', '.5', '--1', '90071992547409.92', 'NaN'])(
    'rejects %j',
    (input) => {
      expect(Money.fromDecimalString(input)).toEqual({
        ok: false,
        error: { code: 'invalid_amount' },
      });
    },
  );
});

describe('Money', () => {
  it('rejects non-integer and unsafe minor units', () => {
    for (const n of [0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => Money.ofMinor(n)).toThrow(RangeError);
    }
  });

  it('throws instead of losing precision on overflow', () => {
    const max = Money.ofMinor(Number.MAX_SAFE_INTEGER);
    expect(() => max.add(Money.ofMinor(1))).toThrow(RangeError);
  });

  it('normalizes negative zero', () => {
    expect(Object.is(Money.zero.negate().minor, 0)).toBe(true);
  });

  it('formats with exactly two decimals', () => {
    expect(Money.ofMinor(125005).toDecimalString()).toBe('1250.05');
    expect(Money.ofMinor(-5).toDecimalString()).toBe('-0.05');
    expect(Money.zero.toDecimalString()).toBe('0.00');
  });

  it('sums an empty list to zero', () => {
    expect(Money.sum([]).isZero()).toBe(true);
  });

  it('reports sign and order', () => {
    const one = Money.ofMinor(1);
    expect([one.isPositive(), one.isNegative(), one.isZero()]).toEqual([true, false, false]);
    expect([one.compare(Money.zero), Money.zero.compare(one), one.compare(one)]).toEqual([
      1, -1, 0,
    ]);
  });
});

describe('Money properties', () => {
  it('formatting then parsing returns the same amount', () => {
    fc.assert(fc.property(money, (a) => parse(a.toDecimalString()).equals(a)));
  });

  it('addition is commutative and associative', () => {
    fc.assert(
      fc.property(money, money, money, (a, b, c) => {
        expect(a.add(b).equals(b.add(a))).toBe(true);
        expect(
          a
            .add(b)
            .add(c)
            .equals(a.add(b.add(c))),
        ).toBe(true);
      }),
    );
  });

  it('subtracting is adding the negation, and a - a = 0', () => {
    fc.assert(
      fc.property(money, money, (a, b) => {
        expect(a.subtract(b).equals(a.add(b.negate()))).toBe(true);
        expect(a.subtract(a).isZero()).toBe(true);
      }),
    );
  });

  it('sum equals repeated addition', () => {
    fc.assert(
      fc.property(fc.array(money, { maxLength: 20 }), (items) =>
        Money.sum(items).equals(items.reduce((acc, m) => acc.add(m), Money.zero)),
      ),
    );
  });
});
