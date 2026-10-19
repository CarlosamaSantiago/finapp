import type { LocalDate } from '../dates.js';
import type { EntryId } from '../ids.js';
import { err, ok, type Result } from '../result.js';
import { validateEntry, type EntryError, type LedgerEntry } from './entry.js';

export type AppendError =
  | EntryError
  | { readonly code: 'duplicate_id' }
  | { readonly code: 'reversal_target_not_found' }
  | { readonly code: 'reversal_of_reversal' }
  | { readonly code: 'already_reversed' }
  | { readonly code: 'reversal_mismatch' }
  | { readonly code: 'reversal_before_original' };

/** Builds the entry that cancels `original`: same kind, amounts and links, opposite effect. */
export function reverse(
  original: LedgerEntry,
  reversal: { id: EntryId; occurredOn: LocalDate; note: string | null },
): LedgerEntry {
  return { ...original, ...reversal, reversesEntryId: original.id };
}

const mirrors = (a: LedgerEntry, b: LedgerEntry) =>
  a.kind === b.kind &&
  a.amount.equals(b.amount) &&
  a.interest.equals(b.interest) &&
  a.categoryId === b.categoryId &&
  a.sourceAccountId === b.sourceAccountId &&
  a.destinationAccountId === b.destinationAccountId &&
  a.goalId === b.goalId &&
  a.liabilityId === b.liabilityId;

/** Checks whether `entry` may be appended to `ledger`, including the reversal rules in ADR 0002. */
export function validateAppend(
  entry: LedgerEntry,
  ledger: readonly LedgerEntry[],
): Result<LedgerEntry, readonly AppendError[]> {
  const validated = validateEntry(entry);
  const errors: AppendError[] = validated.ok ? [] : [...validated.error];

  if (ledger.some((e) => e.id === entry.id)) errors.push({ code: 'duplicate_id' });

  if (entry.reversesEntryId !== null) {
    const target = ledger.find((e) => e.id === entry.reversesEntryId);
    if (!target) {
      errors.push({ code: 'reversal_target_not_found' });
    } else {
      if (target.reversesEntryId !== null) errors.push({ code: 'reversal_of_reversal' });
      if (ledger.some((e) => e.reversesEntryId === target.id)) {
        errors.push({ code: 'already_reversed' });
      }
      if (!mirrors(entry, target)) errors.push({ code: 'reversal_mismatch' });
      if (entry.occurredOn < target.occurredOn) errors.push({ code: 'reversal_before_original' });
    }
  }

  return errors.length === 0 ? ok(entry) : err(errors);
}
