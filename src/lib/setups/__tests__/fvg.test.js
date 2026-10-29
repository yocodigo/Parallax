import { describe, expect, it } from 'vitest';
import { fairValueGap } from '../fvg';

const bar = (o, h, l, c) => ({ o, h, l, c });

describe('fairValueGap', () => {
  it('is bullish when the bar after the middle one leaves a gap above it', () => {
    const bars = [bar(10, 10.2, 9.9, 10.1), bar(10.1, 11, 10, 10.9), bar(10.9, 11.2, 11.05, 11.1)];
    expect(fairValueGap(bars, 1)).toEqual({ side: 'bullish', low: 10.2, high: 11.05, ce: 10.625 });
  });

  it('is bearish when the bar after the middle one leaves a gap below it', () => {
    const bars = [bar(10, 10.1, 9.8, 9.9), bar(9.9, 10, 9, 9.1), bar(9.1, 9.75, 8.9, 9.0)];
    expect(fairValueGap(bars, 1)).toEqual({ side: 'bearish', low: 9.75, high: 9.8, ce: 9.775 });
  });

  it('is null when the bars overlap and leave no gap', () => {
    const bars = [bar(10, 10.2, 9.9, 10.1), bar(10.1, 11, 10, 10.9), bar(10.9, 11.1, 10.1, 11)];
    expect(fairValueGap(bars, 1)).toBeNull();
  });

  it('is null when the edges exactly meet, leaving no gap', () => {
    const bars = [bar(10, 10.2, 9.9, 10.1), bar(10.1, 11, 10, 10.9), bar(10.9, 11.2, 10.2, 11.1)];
    expect(fairValueGap(bars, 1)).toBeNull();
  });

  it('is null without a bar on both sides of the middle one', () => {
    const bars = [bar(10, 10.2, 9.9, 10.1), bar(10.1, 11, 10, 10.9)];
    expect(fairValueGap(bars, 0)).toBeNull();
    expect(fairValueGap(bars, 1)).toBeNull();
  });
});
