import { parseLocalDate } from '@finapp/domain';
import { z } from 'zod';

/** Idempotency key sent with every write request. */
export const RequestIdSchema = z.uuid();
export type RequestId = z.infer<typeof RequestIdSchema>;

/** Money crosses the wire as an integer number of minor units (centavos), never as a decimal. */
export const MinorSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
export const PositiveMinorSchema = MinorSchema.positive();

export const IdSchema = z.number().int().positive();

export const LocalDateSchema = z
  .string()
  .refine((s) => parseLocalDate(s).ok, { message: 'Expected a valid YYYY-MM-DD date' });

export const YearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const NameSchema = z.string().trim().min(1).max(80);

/** Every error response. `details` carries domain error codes; messages are localized by the client. */
export const ErrorSchema = z.object({
  error: z.string(),
  details: z.array(z.object({ code: z.string(), field: z.string().optional() })).optional(),
});
export type ErrorBody = z.infer<typeof ErrorSchema>;
