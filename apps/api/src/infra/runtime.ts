import { createStore, openStore, storeExists } from '@finapp/db';
import type { LocalDate } from '@finapp/domain';
import { fileURLToPath } from 'node:url';
import type { StoreAccess } from '../auth/vault.js';

/** Today's date in the machine's local time zone, as the user sees it. */
export function localToday(): LocalDate {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` as LocalDate;
}

export const isoNow = () => new Date().toISOString();

export function fileStore(dir: string): StoreAccess {
  return {
    exists: () => storeExists(dir),
    create: (passphrase) => createStore(dir, passphrase),
    open: (passphrase) => openStore(dir, passphrase),
  };
}

export interface Config {
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly dataDir: string;
  readonly webOrigins: readonly string[];
}

/** Reads FINAPP_* environment variables. The API refuses to bind anywhere but loopback. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const host = env.FINAPP_HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1') {
    throw new Error(`Refusing to start: FINAPP_HOST must be 127.0.0.1 (got ${host})`);
  }
  const port = Number(env.FINAPP_PORT ?? 4317);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid FINAPP_PORT');
  const webPort = Number(env.FINAPP_WEB_PORT ?? 5173);
  return {
    host,
    port,
    dataDir: env.FINAPP_DATA_DIR ?? fileURLToPath(new URL('../../../../data', import.meta.url)),
    webOrigins: [`http://127.0.0.1:${String(webPort)}`, `http://localhost:${String(webPort)}`],
  };
}
