# ADR 0004: API sessions, request security and conventions

- Status: Accepted
- Date: 2026-10-19
- Milestone: M3

## Context

The API (`apps/api`, Fastify) serves one user on one machine. The threats are other local processes, web pages
calling `localhost` (CSRF, DNS rebinding) and anyone with access to an unlocked laptop (ARCHITECTURE.md §6).

## Decision

1. **Loopback only.** The server binds to `127.0.0.1` and refuses to start with any other `FINAPP_HOST`.
2. **Host and Origin allowlists** run before anything else: an unknown `Host` gets 421 (DNS rebinding), a
   present but unknown `Origin` gets 403. The API never sends CORS headers; the web app reaches it through the
   Vite dev proxy (M4), so the browser only ever talks to its own origin.
3. **Login is decryption (ADR 0003).** The vault holds the open database while unlocked. Logout, a restart or
   15 idle minutes lock it again. There is exactly one session; a new login replaces it.
4. **Session cookie + CSRF token.** Login returns a random session token in an `HttpOnly`, `SameSite=Strict`
   cookie scoped to `/api`, and a separate CSRF token in the body. Every non-GET request must echo it in
   `x-csrf-token`. `GET /api/session` returns it again for the cookie holder, so a reloaded page keeps working.
5. **Brute force.** After 5 wrong passphrases logins are blocked for 30 s, doubling per further failure up to
   30 min, plus a 10 requests/minute rate limit on setup and login.
6. **Conventions.**
   - Bodies and responses are validated and serialized with the Zod schemas in `packages/contracts`.
   - Money is an integer number of minor units (`...Minor`) in JSON.
   - Errors are `{ error, details? }`; `details` carries domain codes (`missing_field`, `already_reversed`,
     ...) that the UI translates. Schema failures are `422 validation_failed`, ledger rules `422
ledger_rejected`, duplicate names `409 duplicate_name`.
   - Every write takes a UUID `requestId`. Entries use the ledger's own `request_id`; master-data writes replay
     the stored response from `idempotency_keys`.
   - Logs never include bodies, the cookie or the CSRF header.
7. **Runtime:** TypeScript runs through `tsx` (`pnpm --filter @finapp/api dev`), no build step.

## Consequences

- No remote access, by design. A second device would need a new ADR (TLS, real users).
- Entries can be filtered by month but are computed from the full ledger in memory, which is fine for a
  personal ledger (thousands of rows) and keeps one source of truth for balances.
