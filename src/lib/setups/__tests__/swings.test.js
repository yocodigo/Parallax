import { describe, expect, it } from 'vitest';
import { dealingRange, isMidRange, swings, trend } from '../swings';

const bars = (pairs) => pairs.map(([h, l]) => ({ h, l }));
// The mirror image: highs become lows, so an uptrend becomes a downtrend.
const mirror = (list) => list.map(({ h, l }) => ({ h: -l, l: -h }));

// Swing high at bar 2 (13), low at 4 (8), high at 6 (16), low at 8 (9).
const zigzag = bars([
  [10, 9],
  [11, 10],
  [13, 12],
  [12, 11],
  [11, 8],
  [14, 12],
  [16, 13],
  [15, 10],
  [14, 9],
  [17, 12],
  [18, 13],
]);

describe('swings', () => {
  it('finds highs and lows beyond the 2 bars on each side, once confirmed', () => {
    expect(swings(zigzag, 10)).toEqual([
      { index: 2, kind: 'high', price: 13 },
      { index: 4, kind: 'low', price: 8 },
      { index: 6, kind: 'high', price: 16 },
      { index: 8, kind: 'low', price: 9 },
    ]);
  });

  it('confirms a swing only 2 bars after it', () => {
    // At bar 9 the low at bar 8 has only one bar after it.
    expect(swings(zigzag, 9).map((s) => s.index)).toEqual([2, 4, 6]);
  });

  it('needs the high strictly above its neighbors', () => {
    const flatTop = bars([
      [10, 9],
      [11, 10],
      [13, 12],
      [13, 11],
      [11, 10],
      [10, 9],
    ]);
    expect(swings(flatTop, 5).filter((s) => s.kind === 'high')).toEqual([]);
  });

  it('can find a high and a low on the same bar', () => {
    const outside = bars([
      [10, 9],
      [10, 9],
      [12, 7],
      [10, 9],
      [10, 9],
    ]);
    expect(swings(outside, 4)).toEqual([
      { index: 2, kind: 'high', price: 12 },
      { index: 2, kind: 'low', price: 7 },
    ]);
  });

  it('takes another number of bars on each side', () => {
    expect(swings(zigzag, 10, 1).map((s) => s.index)).toEqual([2, 4, 6, 8]);
    // With 3 a side, bar 9's 17 rules out the high at 6; the low at 4 holds.
    expect(swings(zigzag, 10, 3)).toEqual([{ index: 4, kind: 'low', price: 8 }]);
  });
});

describe('trend', () => {
  it('is up with a higher high and a higher low', () => {
    expect(trend(swings(zigzag, 10))).toBe('up');
  });

  it('is down with a lower high and a lower low', () => {
    expect(trend(swings(mirror(zigzag), 10))).toBe('down');
  });

  it('is range otherwise', () => {
    const widening = [
      { kind: 'high', price: 13 },
      { kind: 'low', price: 8 },
      { kind: 'high', price: 16 },
      { kind: 'low', price: 7 },
    ];
    expect(trend(widening)).toBe('range');
  });

  it('is null without two highs and two lows', () => {
    expect(trend(swings(zigzag, 9))).toBeNull();
  });
});

describe('dealingRange', () => {
  it('runs from the last swing low to the last swing high', () => {
    expect(dealingRange(swings(zigzag, 10))).toEqual({ low: 9, high: 16 });
  });

  it('is null without both', () => {
    expect(dealingRange(swings(zigzag, 5))).toBeNull();
  });

  it('keeps the order when the last low formed above the last high', () => {
    const list = [
      { kind: 'high', price: 16 },
      { kind: 'low', price: 18 },
    ];
    expect(dealingRange(list)).toEqual({ low: 18, high: 16 });
  });
});

describe('isMidRange', () => {
  const range = { low: 10, high: 20 };

  it('is true from 40% to 60% of the range, both ends included', () => {
    expect(isMidRange(14, range)).toBe(true);
    expect(isMidRange(15, range)).toBe(true);
    expect(isMidRange(16, range)).toBe(true);
  });

  it('is false outside it', () => {
    expect(isMidRange(13.9, range)).toBe(false);
    expect(isMidRange(16.1, range)).toBe(false);
  });

  it('measures the same middle when the low is above the high', () => {
    const inverted = { low: 18, high: 16 };
    expect(isMidRange(17, inverted)).toBe(true);
    expect(isMidRange(16.5, inverted)).toBe(false);
  });

  it('is false for a range with no width', () => {
    expect(isMidRange(10, { low: 10, high: 10 })).toBe(false);
  });
});
