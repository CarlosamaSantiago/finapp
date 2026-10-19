import { Money } from '@finapp/domain';

/**
 * Parses an amount typed in es-CO style (`1.250.000,50`, `1250000`, `$ 1.250`) into minor units.
 * Dots are thousands separators and the comma is the decimal mark. Returns null if it is not exact.
 */
export function parseAmountInput(input: string): number | null {
  const cleaned = input.replace(/[\s$]/g, '');
  if (!/^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^-?\d+(,\d{1,2})?$/.test(cleaned)) return null;
  const parsed = Money.fromDecimalString(cleaned.replace(/\./g, '').replace(',', '.'));
  return parsed.ok ? parsed.value.minor : null;
}
