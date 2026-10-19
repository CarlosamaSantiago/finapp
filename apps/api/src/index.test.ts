import { describe, expect, it } from 'vitest';
import { RequestIdSchema } from '@finapp/contracts';

describe('@finapp/api', () => {
  it('resolves workspace packages', () => {
    expect(RequestIdSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});
