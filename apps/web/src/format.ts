const integerFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/**
 * `$ 1.250.000` or `-$ 12.050,50` from integer minor units. Pesos and centavos are split with integer
 * arithmetic, so no float ever touches the amount.
 */
export function formatMoney(minor: number): string {
  const abs = Math.abs(minor);
  const cents = abs % 100;
  const pesos = (abs - cents) / 100;
  const decimals = cents === 0 ? '' : `,${String(cents).padStart(2, '0')}`;
  return `${minor < 0 ? '-' : ''}$ ${integerFormat.format(pesos)}${decimals}`;
}

/** Minor units as an editable es-CO string: 125000050 -> `1.250.000,50`. */
export function toAmountInput(minor: number): string {
  return formatMoney(minor).replace('$ ', '');
}

const dateFormat = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthFormat = new Intl.DateTimeFormat('es-CO', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const utc = (isoDate: string) => {
  const [y = 0, m = 1, d = 1] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** `2026-10-19` -> `19 oct 2026`. Calendar dates are formatted in UTC so they never shift a day. */
export const formatDate = (isoDate: string) => dateFormat.format(utc(isoDate));

/** `2026-10` -> `octubre de 2026`. */
export const formatMonth = (yearMonth: string) => monthFormat.format(utc(`${yearMonth}-01`));

const pad = (n: number) => String(n).padStart(2, '0');

/** Today in the user's time zone as `YYYY-MM-DD`. */
export function today(now = new Date()): string {
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `YYYY-MM` shifted by `delta` months. */
export function shiftMonth(yearMonth: string, delta: number): string {
  const [y = 0, m = 1] = yearMonth.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${String(Math.floor(index / 12))}-${pad((index % 12) + 1)}`;
}
