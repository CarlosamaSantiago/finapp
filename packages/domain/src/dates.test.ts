import { describe, expect, it } from 'vitest';
import { parseLocalDate, yearMonthOf, type LocalDate } from './dates.js';

describe('parseLocalDate', () => {
  it.each(['2026-01-31', '2024-02-29', '2000-02-29', '2026-04-30', '2026-12-31'])(
    'accepts %s',
    (s) => {
      expect(parseLocalDate(s)).toEqual({ ok: true, value: s });
    },
  );

  it.each([
    '2026-02-29', // not a leap year
    '1900-02-29', // divisible by 100, not by 400
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '2026-1-01',
    '2026-01-01T00:00:00Z',
    '',
  ])('rejects %s', (s) => {
    expect(parseLocalDate(s)).toEqual({ ok: false, error: { code: 'invalid_date' } });
  });
});

describe('yearMonthOf', () => {
  it('returns the YYYY-MM part', () => {
    expect(yearMonthOf('2026-10-19' as LocalDate)).toBe('2026-10');
  });
});
