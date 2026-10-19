# ADR 0001: Stack, monorepo layout and supply-chain rules

- Status: Accepted
- Date: 2026-10-19
- Milestone: M0

## Context

The app rewrites a legacy Python personal-finance tool (see `REVERSE_ENGINEERING.md`) as a local-first,
single-user TypeScript app (see `ARCHITECTURE.md`). M0 sets up the repository so later milestones only add
features, not tooling. The project is public, so the setup must also be safe to show.

## Decision

1. **Stack** as listed in `ARCHITECTURE.md` §2. Each dependency is added in the milestone that first needs it
   (Zod in M0; Drizzle in M2; Fastify in M3; React/Vite in M4), not up front.
2. **pnpm workspaces**, no Nx/Turborepo. Packages: `packages/{domain,contracts,db}`, `apps/{api,web}`,
   `tools/import-legacy`, all named `@finapp/*` and linked with `workspace:*`.
3. **Internal packages export TypeScript source** (`"exports": "./src/index.ts"`). No per-package build step;
   the API runtime strategy (`tsx` or a bundler) is decided in M3.
4. **Dependency direction is enforced twice**: ESLint `no-restricted-imports` on imports, and
   `test/architecture.test.ts` on `package.json` dependencies. `packages/domain` may only use relative imports
   and may not read the clock (`Date.now()`, `new Date()`).
5. **One Vitest run at the root** with one project per package.
6. **TypeScript 6.0.3, not 7.** TypeScript 7.0.2 was the latest release, but `typescript-eslint` 8.x supports
   `<6.1.0` only, including its canary. Type-aware linting is worth more than TS 7's speed. Revisit when
   `typescript-eslint` supports TS 7.
7. **Supply-chain rules**
   - Exact versions (`saveExact`), lockfile committed, `pnpm install --frozen-lockfile` in CI.
   - Keep pnpm's `minimumReleaseAge` policy (packages under a day old are refused). Never add
     `minimumReleaseAgeExclude` entries; pick an older version instead. Dependabot uses a 3-day `cooldown`.
   - GitHub Actions pinned to full commit SHAs. gitleaks runs as a checksum-verified release binary rather
     than a third-party action.
8. **Guards against leaking financial data**: `.gitignore`, a pre-commit hook that refuses `data/`, `*.db`,
   `*.sqlite*` and `.env*` even when force-added, gitleaks locally (when installed) and in CI, and CodeQL.

## Consequences

- Adding a workspace package requires a rule in both `eslint.config.js` and `test/architecture.test.ts`;
  the architecture test fails until it exists.
- No build output exists between packages, so editor and tests see changes instantly, but `apps/api` needs a
  TypeScript-aware runtime in M3.
- Version bumps arrive through Dependabot PRs and must pass CI; very new releases wait at least a day (pnpm)
  or three days (Dependabot).
- TypeScript stays one major behind until the lint toolchain catches up. `.github/dependabot.yml` ignores
  `typescript >=6.1.0` and major `@types/node` bumps (which must track the Node major in `.nvmrc`); lift the
  TypeScript ignore together with the pin.
