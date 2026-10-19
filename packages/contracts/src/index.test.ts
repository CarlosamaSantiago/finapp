import { describe, expect, it } from 'vitest';
import { RequestIdSchema } from './index.js';

describe('RequestIdSchema', () => {
  it('accepts a UUID', () => {
    expect(RequestIdSchema.safeParse('3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b').success).toBe(true);
  });

  it('rejects anything else', () => {
    expect(RequestIdSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(RequestIdSchema.safeParse('').success).toBe(false);
  });
});
