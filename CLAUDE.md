# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Finance App

Local-first, single-user personal-finance app. TypeScript monorepo (pnpm). SQLite file on disk, Fastify API, React web UI.
Read `docs/ARCHITECTURE.md` and `docs/REVERSE_ENGINEERING.md` before changing the model.

**Current state: M4 (UI).** All layers work end to end: `packages/domain` (money, ledger rules, balances),
`packages/db` (encrypted store, repositories), `packages/contracts` (Zod schemas), `tools/import-legacy` (import + golden
check), `apps/api` (Fastify, sessions) and `apps/web` (React). Next: M5 polish (README screenshots, `SECURITY.md`, backups).
Milestones are in `docs/ARCHITECTURE.md` §8. Decisions: ADR 0001 (stack, supply chain), 0002 (money, entry kinds,
reversals), 0003 (encrypted store, no ORM), 0004 (API sessions, CSRF, conventions).

## Commands

- Install: `pnpm install`
- Dev (api + web): `pnpm dev`, then open http://127.0.0.1:5173 (Vite proxies `/api` to the API on port 4317). The
  store lives in the repo's data folder unless `FINAPP_DATA_DIR` is set. Smoke-test real servers against a temporary
  `FINAPP_DATA_DIR`, never the real store.
- Typecheck: `pnpm typecheck`
- Lint / format: `pnpm lint` / `pnpm format`
- Unit + API tests: `pnpm test` (with the 90% `packages/domain` coverage gate, as CI runs it: `pnpm test:coverage`)
- Single test (Vitest): `pnpm vitest run <path/to/file.test.ts> -t "<test name>"`
- E2E: `pnpm test:e2e` (Playwright; starts its own API + web on ports 4318/5174 with a throwaway store). First time:
  `pnpm exec playwright install chromium`.
- DB migrations: append to `MIGRATIONS` in `packages/db/src/migrations.ts`; they run automatically when a store opens
- Legacy import (read-only source, dry run by default): `pnpm import:legacy -- --source <old> [--target-dir <dir>]`.
  Only the user runs it on real data; Claude tests it with the synthetic legacy fixture in `importer.test.ts`.
- Run TypeScript entry points with `tsx`. `better-sqlite3-multiple-ciphers` is patched (`patches/`) to expose its types.

Run `pnpm typecheck && pnpm lint && pnpm test` before declaring any task done.

## Architecture rules

- `packages/domain` is pure TypeScript: no I/O, no framework imports, no `Date.now()` (inject a clock).
- How each entry kind moves money is defined once, in `entryEffects` (`packages/domain/src/ledger/effects.ts`); every
  balance folds over it. Kind rules live in the `RULES` table in `ledger/entry.ts`, mirroring ADR 0002.
- Domain test helpers live in `packages/domain/src/testing/` (builders, fast-check arbitraries); production code may not
  import them.
- Dependency direction: `domain` <- `db`, `contracts` <- `api` <- (HTTP). `web` imports `contracts` only.
- All request and response shapes are Zod schemas in `packages/contracts`. Never hand-write duplicate types.
- Boundaries are enforced by `eslint.config.js` (`boundaries`) and `test/architecture.test.ts`. A new package
  needs an entry in both.
- Packages export TypeScript source (`"exports": "./src/index.ts"`); there is no per-package build.

## Dependencies

- Add deps with `pnpm --filter @finapp/<pkg> add <dep>`; versions are pinned exactly. Commit `pnpm-lock.yaml`.
- pnpm refuses releases younger than a day (`minimumReleaseAge`). Never add `minimumReleaseAgeExclude`; pick an
  older version. Don't request today's release by exact version.
- TypeScript stays on 6.x until `typescript-eslint` supports 7 (ADR 0001).
- Pin GitHub Actions to full commit SHAs with the version in a comment.

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
  Enforced by `.claude/settings.json`: deny rules for `data/`, `*.db`, `*.sqlite*` and `.env*`, plus a `PreToolUse` hook
  (`.claude/hooks/block-financial-data.mjs`) that refuses shell commands naming them. If a legitimate command is blocked
  (e.g. one mentioning `*.db` as a glob), use the file tools instead of loosening the rules.

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
