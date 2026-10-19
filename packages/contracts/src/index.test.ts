import { describe, expect, it } from 'vitest';
import {
  CreateEntrySchema,
  LocalDateSchema,
  RequestIdSchema,
  SetupRequestSchema,
  parseAmountInput,
} from './index.js';

const uuid = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

describe('RequestIdSchema', () => {
  it('accepts a UUID and rejects anything else', () => {
    expect(RequestIdSchema.safeParse(uuid).success).toBe(true);
    expect(RequestIdSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('LocalDateSchema', () => {
  it('uses the domain calendar rules', () => {
    expect(LocalDateSchema.safeParse('2024-02-29').success).toBe(true);
    expect(LocalDateSchema.safeParse('2026-02-29').success).toBe(false);
  });
});

describe('CreateEntrySchema', () => {
  it('fills defaults for optional links', () => {
    const parsed = CreateEntrySchema.parse({
      requestId: uuid,
      occurredOn: '2026-10-01',
      kind: 'expense',
      amountMinor: 1000,
      sourceAccountId: 1,
      categoryId: 2,
    });
    expect(parsed).toMatchObject({ interestMinor: 0, destinationAccountId: null, note: null });
  });

  it.each([0, -5, 1.5])('rejects amountMinor %d', (amountMinor) => {
    expect(
      CreateEntrySchema.safeParse({
        requestId: uuid,
        occurredOn: '2026-10-01',
        kind: 'expense',
        amountMinor,
      }).success,
    ).toBe(false);
  });
});

describe('SetupRequestSchema', () => {
  it('requires a passphrase of at least 12 characters', () => {
    expect(SetupRequestSchema.safeParse({ passphrase: 'short' }).success).toBe(false);
    expect(SetupRequestSchema.parse({ passphrase: 'long enough phrase' }).seedDemoData).toBe(false);
  });
});

describe('parseAmountInput (es-CO)', () => {
  it.each([
    ['1.250.000,50', 125_000_050],
    ['1250000', 125_000_000],
    ['$ 1.250', 125_000],
    ['0,5', 50],
    ['12,05', 1205],
    ['-3.000', -300_000],
  ])('%s -> %d', (input, minor) => {
    expect(parseAmountInput(input)).toBe(minor);
  });

  it.each(['', 'abc', '1,234', '1.25', '12.34.5', '1,2,3', '1.2345'])('rejects %j', (input) => {
    expect(parseAmountInput(input)).toBeNull();
  });
});
