import { z } from 'zod';

export const SESSION_STATES = ['uninitialized', 'locked', 'unlocked'] as const;

/** `csrfToken` is only present for the browser that holds the session cookie. */
export const SessionSchema = z.object({
  state: z.enum(SESSION_STATES),
  csrfToken: z.string().optional(),
});
export type Session = z.infer<typeof SessionSchema>;

/** Long passphrases beat complex ones; there is no recovery if it is lost (ADR 0003). */
export const PassphraseSchema = z.string().min(12).max(256);

export const SetupRequestSchema = z.object({
  passphrase: PassphraseSchema,
  seedDemoData: z.boolean().default(false),
});
export type SetupRequest = z.input<typeof SetupRequestSchema>;

export const LoginRequestSchema = z.object({ passphrase: z.string().min(1).max(256) });
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
