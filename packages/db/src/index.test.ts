import { describe, expect, it } from 'vitest';
import * as mod from './index.js';

describe('@finapp/db', () => {
  it('loads', () => {
    expect(mod).toBeDefined();
  });
});
