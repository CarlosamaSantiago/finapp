# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Finance App

Local-first, single-user personal-finance app. TypeScript monorepo (pnpm). SQLite file on disk, Fastify API, React web UI.
Read `docs/ARCHITECTURE.md` and `docs/REVERSE_ENGINEERING.md` before changing the model.

**Current state: pre-M0.** The repo holds only docs; no `package.json`, packages or `.gitignore` exist yet. The commands
below are the target contract: when scaffolding (M0), wire the root scripts to exactly these names, and create
`.gitignore` (`data/`, `*.db`, `.env*`) before the first commit. Milestones M0-M5 are defined in `docs/ARCHITECTURE.md` §8.

## Commands

- Install: `pnpm install`
- Dev (api + web): `pnpm dev`
- Typecheck: `pnpm typecheck`
- Lint / format: `pnpm lint` / `pnpm format`
- Unit + API tests: `pnpm test`
- Single test (Vitest): `pnpm vitest run <path/to/file.test.ts> -t "<test name>"`
- E2E: `pnpm test:e2e`
- DB migrations: `pnpm db:generate` then `pnpm db:migrate`
- Legacy import (read-only source): `pnpm import:legacy -- --source <path-to-old.db>`

Run `pnpm typecheck && pnpm lint && pnpm test` before declaring any task done.

## Architecture rules

- `packages/domain` is pure TypeScript: no I/O, no framework imports, no `Date.now()` (inject a clock).
- Dependency direction: `domain` <- `db`, `contracts` <- `api` <- (HTTP). `web` imports `contracts` only.
- All request and response shapes are Zod schemas in `packages/contracts`. Never hand-write duplicate types.

## Money and ledger (critical)

- Money is `INTEGER` minor units. Never use floats or `number` math on decimals. Use the `Money` value object.
- The ledger is append-only. Fix mistakes with a reversal entry (`reverses_entry_id`), never `UPDATE`/`DELETE`.
- Balances (account, liability, net worth) are derived. Never add a stored balance column.
- Every write endpoint accepts an idempotency key (`request_id`).
- Every DB connection sets `PRAGMA foreign_keys = ON` and WAL mode through the single connection factory.
- `ledger_entries.kind` is an English enum with a `CHECK`. Per-kind invariants (which of source/destination account,
  category, `goal_id`, `liability_id` are required; debt principal = `amount - interest`) live in the domain and are
  mirrored by `CHECK`s where possible. The legacy Spanish kinds and their column rules are in `REVERSE_ENGINEERING.md` §3.
- Master data (`accounts`, `categories`, `liabilities`, `goals`) is soft-deleted via `archived_at`. Monthly closings are
  generated snapshots, never a source of truth. Settings are typed and Zod-validated (no JSON-in-text markers).
- Acceptance ("golden") test: importing the legacy DB must reproduce account balances, liability balances and monthly
  income/expense totals to the cent. Any model change must keep it passing.

## Security rules

- The API binds to `127.0.0.1` only (refuse to start otherwise). Validate `Host` and `Origin`. No permissive CORS.
- Auth: passphrase hashed with Argon2id; `HttpOnly` + `SameSite=Strict` session cookie; CSRF token on mutations; login
  rate limit. The SQLCipher key is derived from the passphrase and never stored in the repo or plain config.
- Never log amounts, account names, tokens or passphrases.
- Parameterized queries only. Validate all input with Zod.
- Never commit `data/`, `*.db`, `.env*` or real financial data. Use the synthetic seed in `packages/db/seed`.
- Never read or print the contents of the real database in a session; use the seed or the in-memory test DB.

## Testing

- Domain: Vitest + `fast-check` property tests (e.g. transfers never change net worth; a reversal restores the prior
  balance). Coverage gate on `packages/domain`.
- API: `fastify.inject` against in-memory SQLite, including auth, CSRF and Host/Origin rejection cases.
- E2E: Playwright happy path (login, add transaction, balance updates, dashboard renders).

## Conventions

- Code, identifiers, commits and docs in English. User-facing strings in Spanish (es-CO) via the i18n layer.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- One milestone per branch and PR. Keep PRs small and tested.
- New architectural decision -> add an ADR in `docs/adr/`.
