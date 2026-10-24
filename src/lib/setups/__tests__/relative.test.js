import { describe, expect, it } from 'vitest';
import { atr, spreadClass, spreadRatio, trueRange, volumeClass, volumeRatio } from '../relative';

// Bars use Alpaca's keys: o, h, l, c, v.
const bar = (h, l, c, v = 100) => ({ h, l, c, v });
// `n` identical bars with a range of 2 and a volume of 100, then `last`.
const after = (n, last) => [...Array.from({ length: n }, () => bar(11, 9, 10)), last];

describe('trueRange', () => {
  it('is the bar’s range when it stays within the previous close', () => {
    expect(trueRange(bar(12, 9, 10), bar(11, 9, 10))).toBe(3);
  });

  it('reaches back to a previous close below the low (a gap up)', () => {
    expect(trueRange(bar(15, 13, 14), bar(11, 9, 10))).toBe(5);
  });

  it('reaches back to a previous close above the high (a gap down)', () => {
    expect(trueRange(bar(8, 6, 7), bar(11, 9, 10))).toBe(4);
  });
});

describe('atr', () => {
  it('averages the true range of the 14 bars ending at i', () => {
    // Bars 1-13 have a true range of 2; bar 14 gaps up to a true range of 16.
    const bars = after(14, bar(26, 24, 25));
    expect(atr(bars, 14)).toBe((13 * 2 + 16) / 14);
  });

  it('ignores bars after i', () => {
    const bars = [...after(14, bar(11, 9, 10)), bar(100, 0, 50)];
    expect(atr(bars, 14)).toBe(2);
  });

  it('is null without 14 bars that each have a previous close', () => {
    expect(atr(after(13, bar(11, 9, 10)), 13)).toBeNull();
  });
});

describe('volumeRatio', () => {
  it('compares the bar’s volume with the average of the 20 bars before it', () => {
    expect(volumeRatio(after(20, bar(11, 9, 10, 250)), 20)).toBe(2.5);
  });

  it('is null without 20 bars before it, or when they traded nothing', () => {
    expect(volumeRatio(after(19, bar(11, 9, 10)), 19)).toBeNull();
    const silent = [...Array.from({ length: 20 }, () => bar(11, 9, 10, 0)), bar(11, 9, 10)];
    expect(volumeRatio(silent, 20)).toBeNull();
  });
});

describe('volumeClass', () => {
  it('sorts the ratio into five classes, each starting at its limit', () => {
    expect(volumeClass(0.49)).toBe('abnormally_low');
    expect(volumeClass(0.5)).toBe('low');
    expect(volumeClass(0.7)).toBe('average');
    expect(volumeClass(1.3)).toBe('high');
    expect(volumeClass(2)).toBe('abnormally_high');
  });

  it('puts a ratio that is a limit on paper in the class it starts', () => {
    // 761.30 - 760.00 computes as 1.2999999999999545.
    expect(volumeClass(761.3 - 760)).toBe('high');
  });

  it('is null without a ratio', () => {
    expect(volumeClass(null)).toBeNull();
  });
});

describe('spreadRatio', () => {
  it('compares the bar’s range with the average range of the 20 bars before it', () => {
    expect(spreadRatio(after(20, bar(13, 9, 12)), 20)).toBe(2);
  });

  it('is null without 20 bars before it', () => {
    expect(spreadRatio(after(19, bar(11, 9, 10)), 19)).toBeNull();
  });
});

describe('spreadClass', () => {
  it('sorts the ratio into four classes, each starting at its limit', () => {
    expect(spreadClass(0.69)).toBe('small');
    expect(spreadClass(0.7)).toBe('average');
    expect(spreadClass(1.3)).toBe('large');
    expect(spreadClass(2)).toBe('abnormally_large');
  });

  it('is null without a ratio', () => {
    expect(spreadClass(null)).toBeNull();
  });
});
