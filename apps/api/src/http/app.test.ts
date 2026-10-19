import type { AccountDto, EntryDto, SummaryDto } from '@finapp/contracts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Vault } from '../auth/vault.js';
import { fileStore } from '../infra/runtime.js';
import { buildApp, CSRF_HEADER, SESSION_COOKIE, type App } from './app.js';

const HOST = '127.0.0.1:4317';
const WEB = 'http://127.0.0.1:5173';
const PASSPHRASE = 'correct horse battery staple';

let dir: string;
let clockMs: number;
let app: App;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'finapp-api-'));
  clockMs = Date.parse('2026-10-19T12:00:00Z');
  app = await buildApp({
    vault: new Vault(fileStore(dir), () => clockMs),
    allowedHosts: [HOST],
    allowedOrigins: [WEB],
    now: () => new Date(clockMs).toISOString(),
    today: () => '2026-10-19' as never,
  });
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

type Method = 'GET' | 'POST';
interface Auth {
  cookie: string;
  csrf: string;
}

const call = (
  method: Method,
  url: string,
  body?: unknown,
  auth?: Auth,
  extra: Record<string, string> = {},
) =>
  app.inject({
    method,
    url,
    headers: {
      host: HOST,
      ...(auth ? { cookie: `${SESSION_COOKIE}=${auth.cookie}`, [CSRF_HEADER]: auth.csrf } : {}),
      ...extra,
    },
    ...(body === undefined ? {} : { payload: body as object }),
  });

async function setup(seedDemoData = true): Promise<Auth> {
  const res = await call('POST', '/api/session/setup', { passphrase: PASSPHRASE, seedDemoData });
  expect(res.statusCode).toBe(201);
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error('no session cookie');
  return { cookie: cookie.value, csrf: res.json<{ csrfToken: string }>().csrfToken };
}

describe('request security', () => {
  it('rejects an unexpected Host header (DNS rebinding)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { host: 'evil.example:4317' },
    });
    expect(res.statusCode).toBe(421);
  });

  it('rejects a foreign Origin and accepts the web app origin', async () => {
    expect(
      (await call('GET', '/api/session', undefined, undefined, { origin: 'https://evil.example' }))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('GET', '/api/session', undefined, undefined, { origin: WEB })).statusCode,
    ).toBe(200);
  });

  it('sends security headers and never CORS headers', async () => {
    const res = await call('GET', '/api/session', undefined, undefined, { origin: WEB });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('requires a session for resources, and the CSRF token for writes', async () => {
    expect((await call('GET', '/api/accounts')).statusCode).toBe(401);
    const auth = await setup();
    expect((await call('GET', '/api/accounts', undefined, auth)).statusCode).toBe(200);
    const body = { requestId: randomUUID(), name: 'X' };
    expect(
      (await call('POST', '/api/categories', body, { ...auth, csrf: 'forged' })).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/categories',
          headers: { host: HOST, cookie: `${SESSION_COOKIE}=${auth.cookie}` },
          payload: body,
        })
      ).statusCode,
    ).toBe(403);
  });
});

describe('session lifecycle', () => {
  it('goes uninitialized -> unlocked -> locked -> unlocked', async () => {
    expect((await call('GET', '/api/session')).json()).toEqual({ state: 'uninitialized' });

    const setupRes = await call('POST', '/api/session/setup', { passphrase: PASSPHRASE });
    const cookie = setupRes.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' });
    const auth = {
      cookie: cookie?.value ?? '',
      csrf: setupRes.json<{ csrfToken: string }>().csrfToken,
    };
    expect((await call('GET', '/api/session', undefined, auth)).json()).toEqual({
      state: 'unlocked',
      csrfToken: auth.csrf,
    });
    expect((await call('POST', '/api/session/setup', { passphrase: PASSPHRASE })).statusCode).toBe(
      409,
    );

    expect((await call('POST', '/api/session/logout', undefined, auth)).statusCode).toBe(204);
    expect((await call('GET', '/api/session')).json()).toEqual({ state: 'locked' });
    expect((await call('GET', '/api/accounts', undefined, auth)).statusCode).toBe(401);

    expect(
      (await call('POST', '/api/session/login', { passphrase: 'wrong passphrase' })).statusCode,
    ).toBe(401);
    const login = await call('POST', '/api/session/login', { passphrase: PASSPHRASE });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({ state: 'unlocked' });
  });

  it('throttles repeated wrong passphrases', async () => {
    const auth = await setup(false);
    await call('POST', '/api/session/logout', undefined, auth);
    for (let i = 0; i < 5; i += 1) {
      expect((await call('POST', '/api/session/login', { passphrase: 'nope' })).statusCode).toBe(
        401,
      );
    }
    const blocked = await call('POST', '/api/session/login', { passphrase: PASSPHRASE });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    clockMs += 31_000;
    expect((await call('POST', '/api/session/login', { passphrase: PASSPHRASE })).statusCode).toBe(
      200,
    );
  });

  it('locks after 15 idle minutes', async () => {
    const auth = await setup(false);
    clockMs += 15 * 60_000 + 1;
    expect((await call('GET', '/api/accounts', undefined, auth)).statusCode).toBe(401);
    expect((await call('GET', '/api/session')).json()).toEqual({ state: 'locked' });
  });

  it('rejects a short passphrase at setup', async () => {
    const res = await call('POST', '/api/session/setup', { passphrase: 'short' });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: 'validation_failed' });
  });
});

describe('resources', () => {
  let auth: Auth;
  beforeEach(async () => {
    auth = await setup();
  });

  const accounts = async () =>
    (await call('GET', '/api/accounts', undefined, auth)).json<AccountDto[]>();
  const balanceOf = async (name: string) =>
    (await accounts()).find((a) => a.name === name)?.balanceMinor;

  it('serves seeded data with derived balances that add up', async () => {
    const list = await accounts();
    expect(list.map((a) => a.name)).toEqual(['Billetera', 'CDT 90 días', 'Cuenta de ahorros']);
    const summary = (await call('GET', '/api/summary', undefined, auth)).json<SummaryDto>();
    expect(summary.assetsMinor).toBe(list.reduce((s, a) => s + a.balanceMinor, 0));
    expect(summary.netWorthMinor).toBe(summary.assetsMinor - summary.debtsMinor);
    expect(summary.months.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('creates master data idempotently and reports duplicate names', async () => {
    const body = {
      requestId: randomUUID(),
      name: 'Nequi',
      type: 'savings',
      liquidity: 'immediate',
      initialBalanceMinor: 5_000,
    };
    const first = await call('POST', '/api/accounts', body, auth);
    const retry = await call('POST', '/api/accounts', body, auth);
    expect(first.statusCode).toBe(201);
    expect(retry.json()).toEqual(first.json());
    expect((await accounts()).filter((a) => a.name === 'Nequi')).toHaveLength(1);
    const duplicate = await call(
      'POST',
      '/api/accounts',
      { ...body, requestId: randomUUID() },
      auth,
    );
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: 'duplicate_name' });
  });

  it('appends entries idempotently and updates balances', async () => {
    const [wallet] = (await accounts()).filter((a) => a.name === 'Billetera');
    const before = wallet?.balanceMinor ?? 0;
    const categories = (await call('GET', '/api/categories', undefined, auth)).json<
      { id: number }[]
    >();
    const body = {
      requestId: randomUUID(),
      occurredOn: '2026-10-18',
      kind: 'expense',
      amountMinor: 25_000,
      sourceAccountId: wallet?.id,
      categoryId: categories[0]?.id,
    };
    const first = await call('POST', '/api/entries', body, auth);
    const retry = await call('POST', '/api/entries', body, auth);
    expect(first.statusCode).toBe(201);
    expect(retry.json<EntryDto>().id).toBe(first.json<EntryDto>().id);
    expect(await balanceOf('Billetera')).toBe(before - 25_000);
  });

  it('returns domain error codes for invalid entries and schema errors for bad input', async () => {
    const missing = await call(
      'POST',
      '/api/entries',
      { requestId: randomUUID(), occurredOn: '2026-10-18', kind: 'expense', amountMinor: 100 },
      auth,
    );
    expect(missing.statusCode).toBe(422);
    expect(missing.json()).toEqual({
      error: 'ledger_rejected',
      details: [
        { code: 'missing_field', field: 'sourceAccountId' },
        { code: 'missing_field', field: 'categoryId' },
      ],
    });
    const decimal = await call(
      'POST',
      '/api/entries',
      { requestId: randomUUID(), occurredOn: '2026-10-18', kind: 'expense', amountMinor: 1.5 },
      auth,
    );
    expect(decimal.statusCode).toBe(422);
    expect(decimal.json()).toMatchObject({ error: 'validation_failed' });
  });

  it('reverses an entry once and restores the balance', async () => {
    const before = await balanceOf('Cuenta de ahorros');
    const [latest] = (await call('GET', '/api/entries?month=2026-10', undefined, auth)).json<
      EntryDto[]
    >();
    if (!latest) throw new Error('no entries');
    const reverseBody = { requestId: randomUUID(), occurredOn: '2026-10-19', note: 'Duplicado' };
    const res = await call('POST', `/api/entries/${String(latest.id)}/reverse`, reverseBody, auth);
    expect(res.statusCode).toBe(201);
    expect(res.json<EntryDto>().reversesEntryId).toBe(latest.id);

    const again = await call(
      'POST',
      `/api/entries/${String(latest.id)}/reverse`,
      { ...reverseBody, requestId: randomUUID() },
      auth,
    );
    expect(again.json()).toMatchObject({ details: [{ code: 'already_reversed' }] });
    const listed = (await call('GET', '/api/entries?month=2026-10', undefined, auth)).json<
      EntryDto[]
    >();
    expect(listed.find((e) => e.id === latest.id)?.reversedByEntryId).toBe(res.json<EntryDto>().id);
    expect((await call('POST', '/api/entries/9999/reverse', reverseBody, auth)).statusCode).toBe(
      404,
    );
    expect(typeof before).toBe('number');
  });

  it('archives accounts and refuses new entries on them', async () => {
    const wallet = (await accounts()).find((a) => a.name === 'Billetera');
    const res = await call(
      'POST',
      `/api/accounts/${String(wallet?.id)}/archive`,
      { requestId: randomUUID() },
      auth,
    );
    expect(res.statusCode).toBe(204);
    expect((await accounts()).map((a) => a.name)).not.toContain('Billetera');
    const all = (await call('GET', '/api/accounts?includeArchived=true', undefined, auth)).json<
      AccountDto[]
    >();
    expect(all.find((a) => a.name === 'Billetera')?.archived).toBe(true);

    const entry = await call(
      'POST',
      '/api/entries',
      {
        requestId: randomUUID(),
        occurredOn: '2026-10-19',
        kind: 'adjustment',
        amountMinor: 100,
        destinationAccountId: wallet?.id,
        note: 'x',
      },
      auth,
    );
    expect(entry.json()).toMatchObject({
      details: [{ code: 'unknown_reference', field: 'destinationAccountId' }],
    });
  });

  it('filters entries by month, newest first', async () => {
    const entries = (await call('GET', '/api/entries?month=2026-09', undefined, auth)).json<
      EntryDto[]
    >();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.occurredOn.startsWith('2026-09'))).toBe(true);
    expect(entries.map((e) => e.occurredOn)).toEqual(
      [...entries.map((e) => e.occurredOn)].sort().reverse(),
    );
  });
});
