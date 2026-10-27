import { describe, expect, it } from 'vitest';
import { isEntryCandle, risingVolume } from '../entry';

// 5m bars as { o, h, l, c, v }.
const bar = (o, h, l, c, v = 100) => ({ o, h, l, c, v });
const prev = bar(10, 11, 9, 10.5);

describe('isEntryCandle', () => {
  it('takes a long entry from an up candle breaking above the previous high with little overlap', () => {
    // Range 10.75-12.75: an eighth of it (10.75-11) overlaps the previous bar.
    expect(isEntryCandle([prev, bar(10.8, 12.75, 10.75, 12.6)], 1, 'long')).toBe(true);
  });

  it('takes a short entry from the mirror image', () => {
    expect(isEntryCandle([prev, bar(9.2, 9.25, 7.25, 7.4)], 1, 'short')).toBe(true);
  });

  it('turns down a candle that closes against the direction', () => {
    expect(isEntryCandle([prev, bar(12.6, 12.75, 10.75, 10.8)], 1, 'long')).toBe(false);
  });

  it('turns down a candle that does not break past the previous extreme', () => {
    // An up candle entirely below the previous one: no overlap, but no new high either.
    expect(isEntryCandle([prev, bar(7, 8.5, 6.5, 8.4)], 1, 'long')).toBe(false);
  });

  it('turns down a candle that overlaps the previous one too much', () => {
    // Range 10-12: half of it overlaps.
    expect(isEntryCandle([prev, bar(10.2, 12, 10, 11.9)], 1, 'long')).toBe(false);
  });

  it('needs a candle before it, and a bias', () => {
    expect(isEntryCandle([bar(10.8, 12.75, 10.75, 12.6)], 0, 'long')).toBe(false);
    expect(isEntryCandle([prev, bar(10.8, 12.75, 10.75, 12.6)], 1, null)).toBe(false);
  });
});

describe('risingVolume', () => {
  it('grades an entry stronger when it traded more than the candle before', () => {
    expect(risingVolume([prev, bar(10.8, 12.75, 10.75, 12.6, 150)], 1)).toBe(true);
    expect(risingVolume([prev, bar(10.8, 12.75, 10.75, 12.6, 100)], 1)).toBe(false);
  });
});
