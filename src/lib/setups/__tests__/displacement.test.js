import { describe, expect, it } from 'vitest';
import { isDisplacement } from '../displacement';

const bar = (o, h, l, c) => ({ o, h, l, c });
// Ten bars with a body of 1, then `last`.
const after = (last, n = 10) => [...Array.from({ length: n }, () => bar(10, 11.2, 9.8, 11)), last];

describe('isDisplacement', () => {
  it('is a body at least twice the average of the 10 before, filling most of the bar', () => {
    expect(isDisplacement(after(bar(11, 13.2, 10.9, 13)), 10)).toBe(true);
  });

  it('counts a falling bar the same way', () => {
    expect(isDisplacement(after(bar(13, 13.1, 10.8, 11)), 10)).toBe(true);
  });

  it('is false for a body under twice the average', () => {
    expect(isDisplacement(after(bar(11, 13, 10.9, 12.9)), 10)).toBe(false);
  });

  it('is false when wicks make up more than 40% of the bar', () => {
    // A body of 2 in a range of 4.
    expect(isDisplacement(after(bar(11, 14, 10, 13)), 10)).toBe(false);
  });

  it('counts a body of exactly twice at real prices, despite floating-point error', () => {
    // 760.14 - 760.00 computes as 0.13999999999998636, twice 760.07 - 760.00
    // as 0.14000000000010004.
    const bars = [...Array.from({ length: 10 }, () => bar(760, 760.08, 759.99, 760.07)), bar(760, 760.15, 760, 760.14)];
    expect(isDisplacement(bars, 10)).toBe(true);
  });

  it('counts a body of exactly 60% of the range at real prices', () => {
    // The bars before have bodies of 0.01, so the size check passes easily and
    // only the share is tested: (760.06 - 760.00) / (760.10 - 760.00)
    // computes as 0.5999999999993179.
    const bars = [...Array.from({ length: 10 }, () => bar(760, 760.02, 759.99, 760.01)), bar(760, 760.1, 760, 760.06)];
    expect(isDisplacement(bars, 10)).toBe(true);
  });

  it('counts any real body after bars with no body, as the rule reads', () => {
    // Twice an average of 0 is 0, so a breakout from dead-flat bars counts.
    const flat = [...Array.from({ length: 10 }, () => bar(10, 10.1, 9.9, 10)), bar(10, 10.06, 10, 10.05)];
    expect(isDisplacement(flat, 10)).toBe(true);
  });

  it('never counts a bar with no body, whatever the options', () => {
    // Any multiple of an average of 0 is 0, and with no body share required,
    // nothing else would stop a bar whose open equals its close.
    const flat = Array.from({ length: 5 }, () => bar(10, 10.1, 9.9, 10));
    expect(isDisplacement(flat, 4, { multiple: 4, lookback: 4, bodyShare: 0 })).toBe(false);
  });

  it('is false without 10 bars before it, or with no range', () => {
    expect(isDisplacement(after(bar(11, 13.2, 10.9, 13), 9), 9)).toBe(false);
    expect(isDisplacement(after(bar(11, 11, 11, 11)), 10)).toBe(false);
  });

  it('averages only the `lookback` bars before it', () => {
    // Six bodies of 1, then four of 0.5: a body of 2 is 4 times the last four
    // (0.5) but not 4 times the last ten (0.8), nor 5 times the last four.
    const bars = [
      ...Array.from({ length: 6 }, () => bar(10, 11.2, 9.8, 11)),
      ...Array.from({ length: 4 }, () => bar(10, 10.6, 9.9, 10.5)),
      bar(11, 13.2, 10.9, 13),
    ];
    expect(isDisplacement(bars, 10, { multiple: 4, lookback: 4 })).toBe(true);
    expect(isDisplacement(bars, 10, { multiple: 4 })).toBe(false);
    expect(isDisplacement(bars, 10, { multiple: 5, lookback: 4 })).toBe(false);
  });

  it('takes another body share', () => {
    // A body of 2 in a range of 4 fills half the bar.
    expect(isDisplacement(after(bar(11, 14, 10, 13)), 10, { bodyShare: 0.5 })).toBe(true);
  });
});
