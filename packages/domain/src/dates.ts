import type { Brand } from './ids.js';
import { err, ok, type Result } from './result.js';

/** A calendar date `YYYY-MM-DD` with no time zone. Compares correctly as a string. */
export type LocalDate = Brand<string, 'LocalDate'>;

/** A calendar month `YYYY-MM`. */
export type YearMonth = Brand<string, 'YearMonth'>;

/** Source of "today". Injected so domain code never reads the system clock. */
export interface Clock {
  today(): LocalDate;
}

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseLocalDate(input: string): Result<LocalDate, { code: 'invalid_date' }> {
  const match = LOCAL_DATE.exec(input);
  if (!match) return err({ code: 'invalid_date' });
  const [, y = '', m = '', d = ''] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return err({ code: 'invalid_date' });
  }
  return ok(input as LocalDate);
}

export const yearMonthOf = (date: LocalDate) => date.slice(0, 7) as YearMonth;
