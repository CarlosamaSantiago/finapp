# ADR 0002: Money, dates and ledger entry kinds

- Status: Accepted
- Date: 2026-10-19
- Milestone: M1

## Context

`packages/domain` holds the money rules. It must be exact (no floats), pure (no I/O, no clock) and able to
reproduce the legacy app's balances and monthly totals to the cent (golden test, M2). The legacy kinds and
their column rules are in `REVERSE_ENGINEERING.md` §3.

## Decision

### Money

- `Money` is an immutable class over an integer count of minor units (centavos). The integer is a JS `number`
  guarded by `Number.isSafeInteger` (up to about 90 trillion COP), which works directly with JSON, Zod and
  `better-sqlite3`. Overflow is a programmer error and throws `RangeError`.
- Single currency (COP, 2 decimals). No currency field until a second currency is needed.
- `Money.fromDecimalString` parses `'1250.00'` exactly (via `BigInt`, never `parseFloat`) and rejects more than
  two decimals instead of rounding. M1 has no rounding operations; they arrive with interest projections.
- `parseFloat`, `toFixed` and `Math.round` are banned in `packages/domain` by lint.

### Dates and time

- Dates are `LocalDate` strings `YYYY-MM-DD`, validated without `Date`. Months are `YearMonth` (`YYYY-MM`).
- Code that needs "today" receives a `Clock`.

### Errors

- Validation of user-supplied data returns `Result<T, E>` with a discriminated-union error, so the API can map
  it to a 422 without parsing messages. Exceptions are reserved for programmer errors.

### Entry kinds

| Kind                | Legacy                        | Source   | Destination | Category  | Link           | Effect                                                                  |
| ------------------- | ----------------------------- | -------- | ----------- | --------- | -------------- | ----------------------------------------------------------------------- |
| `income`            | `ingreso`                     | -        | required    | required  | -              | destination + amount                                                    |
| `expense`           | `gasto`                       | required | -           | required  | -              | source - amount                                                         |
| `transfer`          | `transferencia`, **`ahorro`** | required | required    | optional  | -              | source - amount, destination + amount                                   |
| `goal_contribution` | `aporte_meta`                 | required | -           | required  | `goal_id`      | source - amount, goal progress + amount                                 |
| `debt_payment`      | `pago_deuda`                  | required | -           | required  | `liability_id` | source - amount, liability - (amount - interest)                        |
| `adjustment`        | `ajuste_saldo`                | one of   | one of      | forbidden | -              | source - amount or destination + amount; a non-empty `note` is required |

- `ahorro` (move into savings) is a `transfer`: it moves money between own accounts. "Saved this month" can be
  derived from the destination account's type.
- `goal_contribution` lowers the source account balance (confirmed legacy behaviour), so it also lowers net
  worth. Goal progress is the sum of contributions.
- `adjustment` reconciles the ledger with reality (e.g. an unrecorded bank fee). Mistakes in entries are fixed
  with reversals instead.
- Fields not listed for a kind must be empty. `amount > 0`; `interest` is `0` except for `debt_payment`, where
  `0 <= interest <= amount`.

### Reversals

- A reversal copies the original's kind, amounts, accounts, category and links, sets `reversesEntryId`, and has
  exactly the opposite effect.
- It may not target a reversal, may not target an entry that is already reversed, and may not be dated before
  the original.
- Monthly totals count a reversal in its own month (when it was recorded), not the original's month.

## Consequences

- One function (`entryEffects`) defines how every kind moves money; all balances fold over it, so a new kind
  is one change plus tests.
- Merging `ahorro` into `transfer` means the importer maps two legacy kinds to one, and legacy "savings"
  figures must be recomputed from account types if needed.
- Monthly income/expense totals cover `income` and `expense` only. If the golden test shows the legacy app
  counted other kinds (e.g. debt interest), this ADR is updated together with the code.
