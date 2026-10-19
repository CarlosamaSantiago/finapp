import { describe, expect, it } from 'vitest';
import { RequestIdSchema } from '@finapp/contracts';

describe('@finapp/web', () => {
  it('resolves @finapp/contracts', () => {
    expect(RequestIdSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});
