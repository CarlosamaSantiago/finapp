import {
  AccountSchema,
  CategorySchema,
  CreateAccountSchema,
  CreateCategorySchema,
  CreateEntrySchema,
  CreateGoalSchema,
  CreateLiabilitySchema,
  EntriesQuerySchema,
  EntrySchema,
  ErrorSchema,
  GoalSchema,
  IdParamsSchema,
  LiabilitySchema,
  RequestIdSchema,
  ReverseEntrySchema,
  SummarySchema,
} from '@finapp/contracts';
import {
  accountsRepository,
  categoriesRepository,
  goalsRepository,
  idempotencyRepository,
  ledgerRepository,
  liabilitiesRepository,
  type Db,
} from '@finapp/db';
import {
  Money,
  accountBalance,
  entryId,
  liabilityBalance,
  monthlyTotals,
  reverse,
  type AccountId,
  type CategoryId,
  type GoalId,
  type LiabilityId,
  type LocalDate,
} from '@finapp/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppOptions } from '../app.js';
import { accountDto, categoryDto, entryDto, goalDto, liabilityDto } from './../dto.js';

const ListQuerySchema = z.object({ includeArchived: z.stringbool().default(false) });
const ArchiveBodySchema = z.object({ requestId: RequestIdSchema });

/** The JSON a write returned the first time, replayed for a retried `requestId`. */
interface Stored<T> {
  readonly status: 201 | 409;
  readonly body: T | { error: string };
}

export const resourceRoutes: FastifyPluginAsyncZod<AppOptions> = async (app, { now }) => {
  const repos = (db: Db) => ({
    accounts: accountsRepository(db, now),
    categories: categoriesRepository(db, now),
    liabilities: liabilitiesRepository(db, now),
    goals: goalsRepository(db, now),
    ledger: ledgerRepository(db, now),
    keys: idempotencyRepository(db, now),
  });

  // --- accounts -------------------------------------------------------------------------------

  app.get(
    '/accounts',
    { schema: { querystring: ListQuerySchema, response: { 200: z.array(AccountSchema) } } },
    async (req) => {
      const r = repos(req.db);
      const ledger = r.ledger.list();
      return r.accounts.list(req.query).map((a) => accountDto(a, ledger));
    },
  );

  app.post(
    '/accounts',
    { schema: { body: CreateAccountSchema, response: { 201: AccountSchema, 409: ErrorSchema } } },
    async (req, reply) => {
      const r = repos(req.db);
      const { requestId, initialBalanceMinor, ...rest } = req.body;
      const result = r.keys.once(requestId, 'createAccount', (): Stored<unknown> => {
        const created = r.accounts.create({
          ...rest,
          initialBalance: Money.ofMinor(initialBalanceMinor),
        });
        return created.ok
          ? { status: 201, body: accountDto(created.value, []) }
          : { status: 409, body: { error: created.error.code } };
      });
      return reply.code(result.status).send(result.body as never);
    },
  );

  // --- categories -----------------------------------------------------------------------------

  app.get(
    '/categories',
    { schema: { querystring: ListQuerySchema, response: { 200: z.array(CategorySchema) } } },
    async (req) => repos(req.db).categories.list(req.query).map(categoryDto),
  );

  app.post(
    '/categories',
    { schema: { body: CreateCategorySchema, response: { 201: CategorySchema, 409: ErrorSchema } } },
    async (req, reply) => {
      const r = repos(req.db);
      const result = r.keys.once(req.body.requestId, 'createCategory', (): Stored<unknown> => {
        const created = r.categories.create({ name: req.body.name });
        return created.ok
          ? { status: 201, body: categoryDto(created.value) }
          : { status: 409, body: { error: created.error.code } };
      });
      return reply.code(result.status).send(result.body as never);
    },
  );

  // --- liabilities ----------------------------------------------------------------------------

  app.get(
    '/liabilities',
    { schema: { querystring: ListQuerySchema, response: { 200: z.array(LiabilitySchema) } } },
    async (req) => {
      const r = repos(req.db);
      const ledger = r.ledger.list();
      return r.liabilities.list(req.query).map((l) => liabilityDto(l, ledger));
    },
  );

  app.post(
    '/liabilities',
    {
      schema: { body: CreateLiabilitySchema, response: { 201: LiabilitySchema, 409: ErrorSchema } },
    },
    async (req, reply) => {
      const r = repos(req.db);
      const { requestId, openingBalanceMinor, ...rest } = req.body;
      const result = r.keys.once(requestId, 'createLiability', (): Stored<unknown> => {
        const created = r.liabilities.create({
          ...rest,
          openingBalance: Money.ofMinor(openingBalanceMinor),
        });
        return created.ok
          ? { status: 201, body: liabilityDto(created.value, []) }
          : { status: 409, body: { error: created.error.code } };
      });
      return reply.code(result.status).send(result.body as never);
    },
  );

  // --- goals ----------------------------------------------------------------------------------

  app.get(
    '/goals',
    { schema: { querystring: ListQuerySchema, response: { 200: z.array(GoalSchema) } } },
    async (req) => {
      const r = repos(req.db);
      const ledger = r.ledger.list();
      return r.goals.list(req.query).map((g) => goalDto(g, ledger));
    },
  );

  app.post(
    '/goals',
    { schema: { body: CreateGoalSchema, response: { 201: GoalSchema, 409: ErrorSchema } } },
    async (req, reply) => {
      const r = repos(req.db);
      const { requestId, targetMinor, targetDate, accountId, name } = req.body;
      const result = r.keys.once(requestId, 'createGoal', (): Stored<unknown> => {
        const created = r.goals.create({
          name,
          target: Money.ofMinor(targetMinor),
          targetDate: targetDate as LocalDate | null,
          accountId: accountId as AccountId | null,
        });
        return created.ok
          ? { status: 201, body: goalDto(created.value, []) }
          : { status: 409, body: { error: created.error.code } };
      });
      return reply.code(result.status).send(result.body as never);
    },
  );

  // --- archiving (naturally idempotent; requestId accepted for a uniform write contract) -------

  for (const [path, archive] of [
    ['accounts', (db: Db, id: number) => repos(db).accounts.archive(id as AccountId)],
    ['categories', (db: Db, id: number) => repos(db).categories.archive(id as CategoryId)],
    ['liabilities', (db: Db, id: number) => repos(db).liabilities.archive(id as LiabilityId)],
    ['goals', (db: Db, id: number) => repos(db).goals.archive(id as GoalId)],
  ] as const) {
    app.post(
      `/${path}/:id/archive`,
      {
        schema: {
          params: IdParamsSchema,
          body: ArchiveBodySchema,
          response: { 204: z.null() },
        },
      },
      async (req, reply) => {
        archive(req.db, req.params.id);
        return reply.code(204).send(null);
      },
    );
  }

  // --- ledger entries -------------------------------------------------------------------------

  app.get(
    '/entries',
    { schema: { querystring: EntriesQuerySchema, response: { 200: z.array(EntrySchema) } } },
    async (req) => {
      const ledger = repos(req.db).ledger.list();
      const { month } = req.query;
      return ledger
        .filter((e) => !month || e.occurredOn.startsWith(month))
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id - a.id)
        .map((e) => entryDto(e, ledger));
    },
  );

  app.post(
    '/entries',
    { schema: { body: CreateEntrySchema, response: { 201: EntrySchema, 422: ErrorSchema } } },
    async (req, reply) => {
      const { requestId, amountMinor, interestMinor, occurredOn, ...links } = req.body;
      const result = repos(req.db).ledger.append(
        {
          ...links,
          occurredOn: occurredOn as LocalDate,
          amount: Money.ofMinor(amountMinor),
          interest: Money.ofMinor(interestMinor),
          categoryId: links.categoryId as CategoryId | null,
          sourceAccountId: links.sourceAccountId as AccountId | null,
          destinationAccountId: links.destinationAccountId as AccountId | null,
          goalId: links.goalId as GoalId | null,
          liabilityId: links.liabilityId as LiabilityId | null,
          reversesEntryId: null,
        },
        requestId,
      );
      if (!result.ok) {
        return reply.code(422).send({ error: 'ledger_rejected', details: [...result.error] });
      }
      return reply.code(201).send(entryDto(result.value, []));
    },
  );

  app.post(
    '/entries/:id/reverse',
    {
      schema: {
        params: IdParamsSchema,
        body: ReverseEntrySchema,
        response: { 201: EntrySchema, 404: ErrorSchema, 422: ErrorSchema },
      },
    },
    async (req, reply) => {
      const ledger = repos(req.db).ledger;
      const original = ledger.list().find((e) => e.id === req.params.id);
      if (!original) return reply.code(404).send({ error: 'not_found' });
      const reversal = reverse(original, {
        id: entryId(original.id), // replaced on append
        occurredOn: req.body.occurredOn as LocalDate,
        note: req.body.note,
      });
      const result = ledger.append(reversal, req.body.requestId);
      if (!result.ok) {
        return reply.code(422).send({ error: 'ledger_rejected', details: [...result.error] });
      }
      return reply.code(201).send(entryDto(result.value, []));
    },
  );

  // --- summary --------------------------------------------------------------------------------

  app.get('/summary', { schema: { response: { 200: SummarySchema } } }, async (req) => {
    const r = repos(req.db);
    const ledger = r.ledger.list();
    const accounts = r.accounts.list({ includeArchived: true });
    const balances = accounts.map((a) => ({ account: a, balance: accountBalance(a, ledger) }));
    const assets = Money.sum(balances.map((b) => b.balance));
    const debts = Money.sum(
      r.liabilities.list({ includeArchived: true }).map((l) => liabilityBalance(l, ledger)),
    );
    const months = [...monthlyTotals(ledger)]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, t]) => ({ month, incomeMinor: t.income.minor, expenseMinor: t.expense.minor }));
    return {
      assetsMinor: assets.minor,
      debtsMinor: debts.minor,
      netWorthMinor: assets.subtract(debts).minor,
      emergencyFundMinor: Money.sum(
        balances.filter((b) => b.account.emergencyEligible).map((b) => b.balance),
      ).minor,
      months,
    };
  });
};
