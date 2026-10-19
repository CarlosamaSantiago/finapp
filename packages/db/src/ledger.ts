import {
  Money,
  err,
  ok,
  validateAppend,
  type AccountId,
  type AppendError,
  type CategoryId,
  type EntryField,
  type EntryId,
  type EntryKind,
  type GoalId,
  type LedgerEntry,
  type LiabilityId,
  type LocalDate,
  type Result,
} from '@finapp/domain';
import type { Db } from './connection.js';
import type { Now } from './master-data.js';

export type LedgerAppendError =
  AppendError | { readonly code: 'unknown_reference'; readonly field: EntryField };

export type NewEntry = Omit<LedgerEntry, 'id'>;

interface EntryRow {
  id: number;
  occurred_on: string;
  kind: EntryKind;
  amount_minor: number;
  interest_minor: number;
  category_id: number | null;
  source_account_id: number | null;
  destination_account_id: number | null;
  goal_id: number | null;
  liability_id: number | null;
  reverses_entry_id: number | null;
  note: string | null;
}

const toEntry = (r: EntryRow): LedgerEntry => ({
  id: r.id as EntryId,
  occurredOn: r.occurred_on as LocalDate,
  kind: r.kind,
  amount: Money.ofMinor(r.amount_minor),
  interest: Money.ofMinor(r.interest_minor),
  categoryId: r.category_id as CategoryId | null,
  sourceAccountId: r.source_account_id as AccountId | null,
  destinationAccountId: r.destination_account_id as AccountId | null,
  goalId: r.goal_id as GoalId | null,
  liabilityId: r.liability_id as LiabilityId | null,
  reversesEntryId: r.reverses_entry_id as EntryId | null,
  note: r.note,
});

const REFERENCES: readonly (readonly [EntryField, string])[] = [
  ['sourceAccountId', 'accounts'],
  ['destinationAccountId', 'accounts'],
  ['categoryId', 'categories'],
  ['goalId', 'goals'],
  ['liabilityId', 'liabilities'],
];

export function ledgerRepository(db: Db, now: Now) {
  const all = db.prepare<[], EntryRow>('SELECT * FROM ledger_entries ORDER BY id');
  const byRequestId = db.prepare<[string], EntryRow>(
    'SELECT * FROM ledger_entries WHERE request_id = ?',
  );
  const insert = db.prepare(
    `INSERT INTO ledger_entries (id, occurred_on, kind, amount_minor, interest_minor, category_id,
       source_account_id, destination_account_id, goal_id, liability_id, request_id, reverses_entry_id,
       note, created_at)
     VALUES (@id, @occurredOn, @kind, @amount, @interest, @categoryId, @sourceAccountId,
       @destinationAccountId, @goalId, @liabilityId, @requestId, @reversesEntryId, @note, @createdAt)`,
  );
  const lookups = new Map(
    ['accounts', 'categories', 'goals', 'liabilities'].map((table) => [
      table,
      db.prepare<[number], { archived_at: string | null }>(
        `SELECT archived_at FROM ${table} WHERE id = ?`,
      ),
    ]),
  );

  /** Referenced master data must exist and, except for reversals, must not be archived. */
  function referenceErrors(entry: NewEntry): LedgerAppendError[] {
    const errors: LedgerAppendError[] = [];
    for (const [field, table] of REFERENCES) {
      const id = entry[field];
      if (id === null) continue;
      const row = lookups.get(table)?.get(id);
      if (!row || (row.archived_at !== null && entry.reversesEntryId === null)) {
        errors.push({ code: 'unknown_reference', field });
      }
    }
    return errors;
  }

  const append = db.transaction(
    (entry: NewEntry, requestId: string): Result<LedgerEntry, readonly LedgerAppendError[]> => {
      const existing = byRequestId.get(requestId);
      if (existing) return ok(toEntry(existing));

      const ledger = all.all().map(toEntry);
      const id = ((ledger.at(-1)?.id ?? 0) + 1) as EntryId;
      const candidate: LedgerEntry = { ...entry, id };

      const references = referenceErrors(entry);
      const validated = validateAppend(candidate, ledger);
      const errors = [...references, ...(validated.ok ? [] : validated.error)];
      if (errors.length > 0) return err(errors);

      insert.run({
        ...candidate,
        amount: candidate.amount.minor,
        interest: candidate.interest.minor,
        requestId,
        createdAt: now(),
      });
      return ok(candidate);
    },
  );

  return {
    list: () => all.all().map(toEntry),
    /** Idempotent: a known `requestId` returns the stored entry instead of appending again. */
    append: (entry: NewEntry, requestId: string) => append.immediate(entry, requestId),
  };
}

/** Stores the JSON response of a master-data write so a retried request gets the same answer. */
export function idempotencyRepository(db: Db, now: Now) {
  const find = db.prepare<[string], { operation: string; response: string }>(
    'SELECT operation, response FROM idempotency_keys WHERE request_id = ?',
  );
  const save = db.prepare(
    'INSERT INTO idempotency_keys (request_id, operation, response, created_at) VALUES (?, ?, ?, ?)',
  );
  const run = db.transaction(<T>(requestId: string, operation: string, fn: () => T) => {
    const stored = find.get(requestId);
    if (stored) {
      if (stored.operation !== operation)
        throw new Error('request_id reused for another operation');
      return JSON.parse(stored.response) as T;
    }
    const result = fn();
    save.run(requestId, operation, JSON.stringify(result), now());
    return result;
  });
  return {
    /** Runs `fn` once per `requestId`; later calls return the first JSON result. */
    once: <T>(requestId: string, operation: string, fn: () => T): T =>
      run.immediate(requestId, operation, fn) as T,
  };
}
