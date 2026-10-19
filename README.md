# finapp

[![CI](https://github.com/CarlosamaSantiago/finapp/actions/workflows/ci.yml/badge.svg)](https://github.com/CarlosamaSantiago/finapp/actions/workflows/ci.yml)
[![CodeQL](https://github.com/CarlosamaSantiago/finapp/actions/workflows/codeql.yml/badge.svg)](https://github.com/CarlosamaSantiago/finapp/actions/workflows/codeql.yml)

A local-first, single-user personal-finance app. Your data lives in one SQLite file on your machine and never
leaves it. TypeScript end to end: Fastify API, React UI, pure domain package for money rules.

**Status:** M4: usable end to end (encrypted store, API, web app). See the
[delivery plan](docs/ARCHITECTURE.md#8-delivery-plan).

## Design in one minute

- **The ledger is the source of truth.** Balances, debt and net worth are derived, never stored.
- **Money is integer minor units** (centavos). No floats.
- **The ledger is append-only.** Mistakes are fixed with reversal entries.
- **Domain logic is pure** (`packages/domain`: no I/O, no clock), so it is easy to test.
- **Secure by default:** the API listens on `127.0.0.1` only, the database is encrypted with a key derived from your
  passphrase (Argon2id), and logging in is decrypting. There is no password reset: lose the passphrase, lose the data.

Details: [Architecture](docs/ARCHITECTURE.md) · [Legacy reverse engineering](docs/REVERSE_ENGINEERING.md) ·
[Decisions (ADRs)](docs/adr/)

## Getting started

Requires Node 24 (see `.nvmrc`). pnpm is provided by Corepack at the version pinned in `package.json`.

```sh
corepack enable        # on Windows without admin: corepack enable --install-directory "%APPDATA%\npm"
pnpm install           # also installs the git pre-commit hook
pnpm dev               # API on 127.0.0.1:4317, web app on http://127.0.0.1:5173
```

Open http://127.0.0.1:5173, choose a passphrase and optionally load synthetic demo data. The encrypted store is
created in `data/` (git-ignored); set `FINAPP_DATA_DIR` to put it elsewhere.

| Command                                        | What it does                                         |
| ---------------------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                                     | API and web app with reload                          |
| `pnpm typecheck`                               | `tsc` in the root and every package                  |
| `pnpm lint`                                    | ESLint (incl. architecture rules), Prettier check    |
| `pnpm format`                                  | Prettier write                                       |
| `pnpm test`                                    | All Vitest projects (domain, db, API, web, importer) |
| `pnpm test:coverage`                           | Tests plus the 90% domain coverage gate (CI)         |
| `pnpm test:e2e`                                | Playwright happy path against a throwaway store      |
| `pnpm vitest run <file> -t "<name>"`           | A single test                                        |
| `pnpm import:legacy -- --source <file>`        | Dry-run import of the legacy database + golden check |
| `... --source <file> --target-dir <directory>` | Import into a new encrypted store                    |

## Repository layout

```text
apps/api              Fastify server: sessions, Host/Origin checks, endpoints
apps/web              React app (Vite, TanStack Query, Tailwind), Spanish UI
packages/domain       Money, ledger, invariants, balances. Pure TypeScript
packages/contracts    Zod schemas shared by api and web
packages/db           Encrypted SQLite store, migrations, repositories, synthetic seed
tools/import-legacy   Read-only importer for the legacy database + golden check
e2e                   Playwright tests
```

Dependency direction: `domain` ← `db`, `contracts` ← `api`; `web` uses `contracts` only. Enforced by ESLint and
`test/architecture.test.ts`.

## Security

This repository contains no real financial data and never will: `data/`, `*.db` and `.env*` are ignored, a
pre-commit hook refuses them even when force-added, and gitleaks scans every PR. CodeQL and Dependabot run on
the default branch. The full threat model is in [ARCHITECTURE.md §6](docs/ARCHITECTURE.md#6-security-model).
