import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Db } from '@finapp/db';
import type { LocalDate } from '@finapp/domain';
import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Vault } from '../auth/vault.js';
import { resourceRoutes } from './routes/resources.js';
import { sessionRoutes } from './routes/session.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The unlocked database; set by `requireSession`. */
    db: Db;
  }
}

export const SESSION_COOKIE = 'finapp_session';
export const CSRF_HEADER = 'x-csrf-token';

export interface AppOptions {
  readonly vault: Vault;
  /** `Host` header values this server answers to, e.g. `127.0.0.1:4317`. */
  readonly allowedHosts: readonly string[];
  /** Browser origins allowed to call the API, e.g. the Vite dev server. */
  readonly allowedOrigins: readonly string[];
  readonly now: () => string;
  readonly today: () => LocalDate;
  readonly logger?: boolean;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: options.logger
      ? { redact: ['req.headers.cookie', `req.headers["${CSRF_HEADER}"]`] }
      : false,
    bodyLimit: 64 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const hosts = new Set(options.allowedHosts);
  const origins = new Set(options.allowedOrigins);

  // DNS rebinding and cross-site requests (docs/ARCHITECTURE.md §6). No CORS headers are ever sent.
  app.addHook('onRequest', async (req, reply) => {
    if (!hosts.has(req.headers.host ?? '')) return reply.code(421).send({ error: 'bad_host' });
    const origin = req.headers.origin;
    if (origin !== undefined && !origins.has(origin)) {
      return reply.code(403).send({ error: 'bad_origin' });
    }
  });

  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } } });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.decorateRequest('db', null as unknown as Db);
  app.addHook('onClose', () => {
    options.vault.lock(); // closes the database file
  });

  app.setErrorHandler((unknownError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(unknownError)) {
      return reply.code(422).send({
        error: 'validation_failed',
        details: unknownError.validation.map((v) => ({
          code: v.keyword,
          field: v.instancePath.replace(/^\//, '').replaceAll('/', '.'),
        })),
      });
    }
    const error = unknownError as FastifyError;
    if (error.statusCode === 429) return reply.code(429).send({ error: 'too_many_requests' });
    req.log.error({ err: { message: error.message, code: error.code } }, 'request failed');
    return reply.code(500).send({ error: 'internal' });
  });

  /** Requires the session cookie; mutations also require the CSRF header. */
  const requireSession = async (req: FastifyRequest, reply: FastifyReply) => {
    const db = options.vault.authenticate(req.cookies[SESSION_COOKIE]);
    if (!db) return reply.code(401).send({ error: 'unauthenticated' });
    if (!SAFE_METHODS.has(req.method)) {
      const header = req.headers[CSRF_HEADER];
      if (!options.vault.csrfMatches(typeof header === 'string' ? header : undefined)) {
        return reply.code(403).send({ error: 'bad_csrf_token' });
      }
    }
    req.db = db;
  };

  await app.register(sessionRoutes, { prefix: '/api/session', ...options });
  await app.register(
    async (scoped) => {
      scoped.addHook('preHandler', requireSession);
      await scoped.register(resourceRoutes, options);
    },
    { prefix: '/api' },
  );

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
