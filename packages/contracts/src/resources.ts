import { ACCOUNT_TYPES, ENTRY_KINDS, LIABILITY_TYPES, LIQUIDITY_LEVELS } from '@finapp/domain';
import { z } from 'zod';
import {
  IdSchema,
  LocalDateSchema,
  MinorSchema,
  NameSchema,
  PositiveMinorSchema,
  RequestIdSchema,
  YearMonthSchema,
} from './common.js';

// --- accounts ---------------------------------------------------------------------------------

export const AccountSchema = z.object({
  id: IdSchema,
  name: z.string(),
  type: z.enum(ACCOUNT_TYPES),
  liquidity: z.enum(LIQUIDITY_LEVELS),
  initialBalanceMinor: MinorSchema,
  balanceMinor: MinorSchema,
  emergencyEligible: z.boolean(),
  archived: z.boolean(),
});
export type AccountDto = z.infer<typeof AccountSchema>;

export const CreateAccountSchema = z.object({
  requestId: RequestIdSchema,
  name: NameSchema,
  type: z.enum(ACCOUNT_TYPES),
  liquidity: z.enum(LIQUIDITY_LEVELS),
  initialBalanceMinor: MinorSchema,
  emergencyEligible: z.boolean().default(false),
});
export type CreateAccount = z.input<typeof CreateAccountSchema>;

// --- categories -------------------------------------------------------------------------------

export const CategorySchema = z.object({ id: IdSchema, name: z.string(), archived: z.boolean() });
export type CategoryDto = z.infer<typeof CategorySchema>;

export const CreateCategorySchema = z.object({ requestId: RequestIdSchema, name: NameSchema });
export type CreateCategory = z.infer<typeof CreateCategorySchema>;

// --- liabilities ------------------------------------------------------------------------------

export const LiabilitySchema = z.object({
  id: IdSchema,
  name: z.string(),
  type: z.enum(LIABILITY_TYPES),
  openingBalanceMinor: MinorSchema,
  balanceMinor: MinorSchema,
  archived: z.boolean(),
});
export type LiabilityDto = z.infer<typeof LiabilitySchema>;

export const CreateLiabilitySchema = z.object({
  requestId: RequestIdSchema,
  name: NameSchema,
  type: z.enum(LIABILITY_TYPES),
  openingBalanceMinor: MinorSchema.nonnegative(),
});
export type CreateLiability = z.infer<typeof CreateLiabilitySchema>;

// --- goals ------------------------------------------------------------------------------------

export const GoalSchema = z.object({
  id: IdSchema,
  name: z.string(),
  targetMinor: MinorSchema,
  progressMinor: MinorSchema,
  targetDate: LocalDateSchema.nullable(),
  accountId: IdSchema.nullable(),
  archived: z.boolean(),
});
export type GoalDto = z.infer<typeof GoalSchema>;

export const CreateGoalSchema = z.object({
  requestId: RequestIdSchema,
  name: NameSchema,
  targetMinor: PositiveMinorSchema,
  targetDate: LocalDateSchema.nullable().default(null),
  accountId: IdSchema.nullable().default(null),
});
export type CreateGoal = z.input<typeof CreateGoalSchema>;

// --- ledger entries ---------------------------------------------------------------------------

export const EntrySchema = z.object({
  id: IdSchema,
  occurredOn: LocalDateSchema,
  kind: z.enum(ENTRY_KINDS),
  amountMinor: MinorSchema,
  interestMinor: MinorSchema,
  categoryId: IdSchema.nullable(),
  sourceAccountId: IdSchema.nullable(),
  destinationAccountId: IdSchema.nullable(),
  goalId: IdSchema.nullable(),
  liabilityId: IdSchema.nullable(),
  reversesEntryId: IdSchema.nullable(),
  reversedByEntryId: IdSchema.nullable(),
  note: z.string().nullable(),
});
export type EntryDto = z.infer<typeof EntrySchema>;

/** Per-kind rules are checked by the domain, which returns precise error codes. */
export const CreateEntrySchema = z.object({
  requestId: RequestIdSchema,
  occurredOn: LocalDateSchema,
  kind: z.enum(ENTRY_KINDS),
  amountMinor: PositiveMinorSchema,
  interestMinor: MinorSchema.nonnegative().default(0),
  categoryId: IdSchema.nullable().default(null),
  sourceAccountId: IdSchema.nullable().default(null),
  destinationAccountId: IdSchema.nullable().default(null),
  goalId: IdSchema.nullable().default(null),
  liabilityId: IdSchema.nullable().default(null),
  note: z.string().trim().max(500).nullable().default(null),
});
export type CreateEntry = z.input<typeof CreateEntrySchema>;

export const ReverseEntrySchema = z.object({
  requestId: RequestIdSchema,
  occurredOn: LocalDateSchema,
  note: z.string().trim().max(500).nullable().default(null),
});
export type ReverseEntry = z.input<typeof ReverseEntrySchema>;

export const EntriesQuerySchema = z.object({ month: YearMonthSchema.optional() });

// --- summary ----------------------------------------------------------------------------------

export const SummarySchema = z.object({
  assetsMinor: MinorSchema,
  debtsMinor: MinorSchema,
  netWorthMinor: MinorSchema,
  emergencyFundMinor: MinorSchema,
  months: z.array(
    z.object({ month: YearMonthSchema, incomeMinor: MinorSchema, expenseMinor: MinorSchema }),
  ),
});
export type SummaryDto = z.infer<typeof SummarySchema>;

export const IdParamsSchema = z.object({ id: z.coerce.number().int().positive() });
