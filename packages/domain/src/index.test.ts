import { describe, expect, it } from 'vitest';
import * as domain from './index.js';

describe('@finapp/domain public API', () => {
  it('exposes the M1 building blocks', () => {
    expect(Object.keys(domain)).toEqual(
      expect.arrayContaining(['Money', 'validateAppend', 'reverse', 'accountBalance', 'netWorth']),
    );
  });
});
