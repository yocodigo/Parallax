import { describe, it, expect } from 'vitest';
import { periodReturns, correlationMatrix } from '../correlation';

describe('periodReturns', () => {
  it('computes period-over-period returns', () => {
    expect(periodReturns([100, 110, 99])).toEqual([0.1, -0.1]);
  });
  it('returns empty for fewer than two points', () => {
    expect(periodReturns([100])).toEqual([]);
  });
});

describe('correlationMatrix', () => {
  it('gives 1.0 on the diagonal', () => {
    const m = correlationMatrix({ AAPL: [1, 2, 3, 4], MSFT: [2, 1, 4, 3] });
    expect(m.AAPL.AAPL).toBeCloseTo(1);
    expect(m.MSFT.MSFT).toBeCloseTo(1);
  });
  it('detects perfect positive correlation', () => {
    const m = correlationMatrix({ A: [1, 2, 3, 4], B: [10, 20, 30, 40] });
    expect(m.A.B).toBeCloseTo(1);
  });
  it('detects perfect negative correlation of returns', () => {
    const A = [100, 110, 121, 133.1];
    const B = [100, 90, 81, 72.9];
    const m = correlationMatrix({ A, B });
    expect(m.A.B).toBeCloseTo(-1, 1);
  });
  it('correlates returns, not raw prices', () => {
    const m = correlationMatrix({ A: [1, 2, 3, 4], B: [4, 3, 2, 1] });
    expect(m.A.B).not.toBeCloseTo(-1);
  });
});