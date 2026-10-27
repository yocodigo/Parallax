import { describe, expect, it } from 'vitest';
import { isDisplacement } from '../displacement';

const bar = (o, c, h, l) => ({ o, c, h, l });
// Ten bars with a body of 1, then `last`.
const after = (last, n = 10) => [...Array.from({ length: n }, () => bar(10, 11, 11.2, 9.8)), last];

describe('isDisplacement', () => {
  it('is a body at least twice the average of the 10 before, filling most of the bar', () => {
    expect(isDisplacement(after(bar(11, 13, 13.2, 10.9)), 10)).toBe(true);
  });

  it('counts a falling bar the same way', () => {
    expect(isDisplacement(after(bar(13, 11, 13.1, 10.8)), 10)).toBe(true);
  });

  it('is false for a body under twice the average', () => {
    expect(isDisplacement(after(bar(11, 12.9, 13, 10.9)), 10)).toBe(false);
  });

  it('is false when wicks make up more than 40% of the bar', () => {
    // A body of 2 in a range of 4.
    expect(isDisplacement(after(bar(11, 13, 14, 10)), 10)).toBe(false);
  });

  it('counts a body of exactly twice at real prices, despite floating-point error', () => {
    // 760.14 - 760.00 computes as 0.13999999999998636, twice 760.07 - 760.00
    // as 0.14000000000010004.
    const bars = [...Array.from({ length: 10 }, () => bar(760, 760.07, 760.08, 759.99)), bar(760, 760.14, 760.15, 760)];
    expect(isDisplacement(bars, 10)).toBe(true);
  });

  it('counts any real body after bars with no body, as the rule reads', () => {
    // Twice an average of 0 is 0, so a breakout from dead-flat bars counts.
    const flat = [...Array.from({ length: 10 }, () => bar(10, 10, 10.1, 9.9)), bar(10, 10.05, 10.06, 10)];
    expect(isDisplacement(flat, 10)).toBe(true);
  });

  it('is false without 10 bars before it, or with no range', () => {
    expect(isDisplacement(after(bar(11, 13, 13.2, 10.9), 9), 9)).toBe(false);
    expect(isDisplacement(after(bar(11, 11, 11, 11)), 10)).toBe(false);
  });

  it('takes another multiple and lookback', () => {
    // A body of 2 against four bodies of 1 is not 4 times.
    expect(isDisplacement(after(bar(11, 13, 13.2, 10.9)), 10, { multiple: 4, lookback: 4 })).toBe(false);
  });
});
