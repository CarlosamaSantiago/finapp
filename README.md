# finapp

[![CI](https://github.com/CarlosamaSantiago/finapp/actions/workflows/ci.yml/badge.svg)](https://github.com/CarlosamaSantiago/finapp/actions/workflows/ci.yml)
[![CodeQL](https://github.com/CarlosamaSantiago/finapp/actions/workflows/codeql.yml/badge.svg)](https://github.com/CarlosamaSantiago/finapp/actions/workflows/codeql.yml)

A local-first, single-user personal-finance app. Your data lives in one SQLite file on your machine and never
leaves it. TypeScript end to end: Fastify API, React UI, pure domain package for money rules.

**Status:** M0 (workspace skeleton). See the [delivery plan](docs/ARCHITECTURE.md#8-delivery-plan).

## Design in one minute

- **The ledger is the source of truth.** Balances, debt and net worth are derived, never stored.
- **Money is integer minor units** (centavos). No floats.
- **The ledger is append-only.** Mistakes are fixed with reversal entries.
- **Domain logic is pure** (`packages/domain`: no I/O, no clock), so it is easy to test.
- **Secure by default (planned for M2-M3):** loopback-only API, passphrase login, encryption at rest.

Details: [Architecture](docs/ARCHITECTURE.md) · [Legacy reverse engineering](docs/REVERSE_ENGINEERING.md) ·
[Decisions (ADRs)](docs/adr/)

## Getting started

Requires Node 24 (see `.nvmrc`). pnpm is provided by Corepack at the version pinned in `package.json`.

```sh
corepack enable        # on Windows without admin: corepack enable --install-directory "%APPDATA%\npm"
pnpm install           # also installs the git pre-commit hook
pnpm typecheck && pnpm lint && pnpm test
```

| Command                              | What it does                                      |
| ------------------------------------ | ------------------------------------------------- |
| `pnpm typecheck`                     | `tsc` in the root and every package               |
| `pnpm lint`                          | ESLint (incl. architecture rules), Prettier check |
| `pnpm format`                        | Prettier write                                    |
| `pnpm test`                          | All Vitest projects                               |
| `pnpm vitest run <file> -t "<name>"` | A single test                                     |

## Repository layout

```text
apps/api              Fastify server (M3)
apps/web              React SPA (M4)
packages/domain       Money, ledger, invariants. Pure TypeScript
packages/contracts    Zod schemas shared by api and web
packages/db           Schema, migrations, repositories, synthetic seed (M2)
tools/import-legacy   Read-only importer for the legacy database (M2)
```

Dependency direction: `domain` ← `db`, `contracts` ← `api`; `web` uses `contracts` only. Enforced by ESLint and
`test/architecture.test.ts`.

## Security

This repository contains no real financial data and never will: `data/`, `*.db` and `.env*` are ignored, a
pre-commit hook refuses them even when force-added, and gitleaks scans every PR. CodeQL and Dependabot run on
the default branch. The full threat model is in [ARCHITECTURE.md §6](docs/ARCHITECTURE.md#6-security-model).
