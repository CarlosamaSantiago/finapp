import { err, ok, type Result } from './result.js';

const DECIMAL = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function checked(minor: number): number {
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError('Money out of safe integer range');
  }
  return minor === 0 ? 0 : minor; // normalize -0
}

/** An exact amount in minor units (centavos). Immutable; never uses floating-point arithmetic. */
export class Money {
  static readonly zero = new Money(0);

  private constructor(readonly minor: number) {}

  static ofMinor(minor: number): Money {
    return new Money(checked(minor));
  }

  /** Parses `'1250'`, `'1250.5'` or `'-1250.00'`. More than two decimals is an error, never rounded. */
  static fromDecimalString(input: string): Result<Money, { code: 'invalid_amount' }> {
    const match = DECIMAL.exec(input);
    if (!match) return err({ code: 'invalid_amount' });
    const [, sign = '', units = '', cents = ''] = match;
    const magnitude = BigInt(units) * 100n + BigInt(cents.padEnd(2, '0'));
    if (magnitude > MAX) return err({ code: 'invalid_amount' });
    return ok(new Money(checked(Number(sign === '-' ? -magnitude : magnitude))));
  }

  static sum(amounts: Iterable<Money>): Money {
    let total = Money.zero;
    for (const amount of amounts) total = total.add(amount);
    return total;
  }

  add(other: Money): Money {
    return new Money(checked(this.minor + other.minor));
  }

  subtract(other: Money): Money {
    return new Money(checked(this.minor - other.minor));
  }

  negate(): Money {
    return new Money(checked(-this.minor));
  }

  compare(other: Money): -1 | 0 | 1 {
    return this.minor < other.minor ? -1 : this.minor > other.minor ? 1 : 0;
  }

  equals(other: Money): boolean {
    return this.minor === other.minor;
  }

  isZero(): boolean {
    return this.minor === 0;
  }

  isPositive(): boolean {
    return this.minor > 0;
  }

  isNegative(): boolean {
    return this.minor < 0;
  }

  /** Always two decimals, e.g. `'-1250.05'`. */
  toDecimalString(): string {
    const magnitude = BigInt(Math.abs(this.minor));
    const cents = (magnitude % 100n).toString().padStart(2, '0');
    return `${this.isNegative() ? '-' : ''}${(magnitude / 100n).toString()}.${cents}`;
  }
}
