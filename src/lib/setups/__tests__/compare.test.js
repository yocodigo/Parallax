import { describe, expect, it } from 'vitest';
import { atLeast, atMost } from '../compare';

// (761.10 - 761.00) / (761.40 - 761.00) computes as 0.25000000000007105.
const quarter = (761.1 - 761) / (761.4 - 761);

describe('atMost', () => {
  it('counts a value equal to the limit on paper, despite floating-point error', () => {
    expect(atMost(quarter, 0.25)).toBe(true);
  });

  it('is false above the limit', () => {
    expect(atMost(0.26, 0.25)).toBe(false);
  });
});

describe('atLeast', () => {
  it('counts a value equal to the limit on paper, despite floating-point error', () => {
    // 761.30 - 761.00 computes as 0.2999999999999545.
    expect(atLeast(761.3 - 761, 0.3)).toBe(true);
  });

  it('is false below the limit', () => {
    expect(atLeast(0.29, 0.3)).toBe(false);
  });
});
