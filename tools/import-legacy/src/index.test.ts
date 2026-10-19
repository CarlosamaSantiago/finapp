import { describe, expect, it } from 'vitest';
import * as mod from './index.js';

describe('@finapp/import-legacy', () => {
  it('loads', () => {
    expect(mod).toBeDefined();
  });
});
