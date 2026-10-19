import { Vault } from './auth/vault.js';
import { buildApp } from './http/app.js';
import { fileStore, isoNow, loadConfig, localToday } from './infra/runtime.js';

const config = loadConfig(process.env);
const vault = new Vault(fileStore(config.dataDir), () => Date.now());
const app = await buildApp({
  vault,
  allowedHosts: [`127.0.0.1:${String(config.port)}`, `localhost:${String(config.port)}`],
  allowedOrigins: config.webOrigins,
  now: isoNow,
  today: localToday,
  logger: true,
});

const shutdown = () => {
  void app.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ host: config.host, port: config.port });
