import { argon2, randomBytes } from 'node:crypto';

export const SALT_BYTES = 16;

/** Argon2id parameters (ADR 0003). Changing them makes existing databases unreadable. */
const PARAMS = { parallelism: 1, tagLength: 32, memory: 65_536, passes: 3 } as const;

export const newSalt = (): Buffer => randomBytes(SALT_BYTES);

/** Derives the 32-byte database key from the passphrase. The passphrase itself is never stored. */
export function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', { ...PARAMS, message: passphrase, nonce: salt }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}
