import {
  ErrorSchema,
  LoginRequestSchema,
  SessionSchema,
  SetupRequestSchema,
} from '@finapp/contracts';
import { seedSynthetic } from '@finapp/db';
import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Credentials } from '../../auth/vault.js';
import { CSRF_HEADER, SESSION_COOKIE, type AppOptions } from '../app.js';

const LOGIN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

function startSession(reply: FastifyReply, credentials: Credentials) {
  reply.setCookie(SESSION_COOKIE, credentials.sessionToken, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/api',
    secure: false, // served over http://127.0.0.1 only
  });
  return { state: 'unlocked' as const, csrfToken: credentials.csrfToken };
}

export const sessionRoutes: FastifyPluginAsyncZod<AppOptions> = async (app, options) => {
  const { vault } = options;

  app.get('/', { schema: { response: { 200: SessionSchema } } }, async (req) => {
    const csrfToken = vault.csrfFor(req.cookies[SESSION_COOKIE]);
    return { state: vault.state(), ...(csrfToken ? { csrfToken } : {}) };
  });

  app.post(
    '/setup',
    {
      config: { rateLimit: LOGIN_RATE_LIMIT },
      schema: { body: SetupRequestSchema, response: { 201: SessionSchema, 409: ErrorSchema } },
    },
    async (req, reply) => {
      if (vault.state() !== 'uninitialized') {
        return reply.code(409).send({ error: 'already_initialized' });
      }
      const credentials = await vault.setup(req.body.passphrase, (db) => {
        if (req.body.seedDemoData) seedSynthetic(db, options.now, options.today());
      });
      return reply.code(201).send(startSession(reply, credentials));
    },
  );

  app.post(
    '/login',
    {
      config: { rateLimit: LOGIN_RATE_LIMIT },
      schema: {
        body: LoginRequestSchema,
        response: { 200: SessionSchema, 401: ErrorSchema, 409: ErrorSchema, 429: ErrorSchema },
      },
    },
    async (req, reply) => {
      if (vault.state() === 'uninitialized')
        return reply.code(409).send({ error: 'not_initialized' });
      const outcome = await vault.login(req.body.passphrase);
      if (outcome.kind === 'throttled') {
        reply.header('retry-after', String(Math.ceil(outcome.retryAfterMs / 1000)));
        return reply.code(429).send({ error: 'too_many_attempts' });
      }
      if (outcome.kind === 'wrong_passphrase') {
        return reply.code(401).send({ error: 'wrong_passphrase' });
      }
      return reply.code(200).send(startSession(reply, outcome.credentials));
    },
  );

  app.post(
    '/logout',
    { schema: { response: { 204: z.null(), 403: ErrorSchema } } },
    async (req, reply) => {
      const header = req.headers[CSRF_HEADER];
      if (
        vault.authenticate(req.cookies[SESSION_COOKIE]) &&
        !vault.csrfMatches(typeof header === 'string' ? header : undefined)
      ) {
        return reply.code(403).send({ error: 'bad_csrf_token' });
      }
      vault.lock();
      reply.clearCookie(SESSION_COOKIE, { path: '/api' });
      return reply.code(204).send(null);
    },
  );
};
