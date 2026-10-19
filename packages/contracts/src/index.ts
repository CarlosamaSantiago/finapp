import { z } from 'zod';

/** Idempotency key sent with every write request. */
export const RequestIdSchema = z.uuid();
export type RequestId = z.infer<typeof RequestIdSchema>;
