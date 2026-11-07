import { describe, it, expect } from 'vitest';
import { reshapeBars, summarize, rebaseSeries, rebasedLabel } from '../bars';

const sampleBars = {
  AAPL: [
    { t: '2026-01-02T05:00:00Z', c: 200 },
    { t: '2026-01-03T05:00:00Z', c: 210 },
  ],
  MSFT: [
    { t: '2026-01-02T05:00:00Z', c: 400 },
    { t: '2026-01-03T05:00:00Z', c: 396 },
  ],
};

describe('reshapeBars', () => {
  it('merges per-symbol bars into date-keyed rows', () => {
    expect(reshapeBars(sampleBars)).toEqual([
      { date: '2026-01-02', AAPL: 200, MSFT: 400 },
      { date: '2026-01-03', AAPL: 210, MSFT: 396 },
    ]);
  });

  it('sorts rows chronologically', () => {
    const scrambled = { AAPL: [
      { t: '2026-01-03T05:00:00Z', c: 210 },
      { t: '2026-01-02T05:00:00Z', c: 200 },
    ]};
    expect(reshapeBars(scrambled).map((r) => r.date)).toEqual([
      '2026-01-02',
      '2026-01-03',
    ]);
  });

  it('returns an empty array for no bars', () => {
    expect(reshapeBars({})).toEqual([]);
  });
});

describe('summarize', () => {
  it('computes last, change and percent change per symbol', () => {
    const result = summarize(sampleBars, ['AAPL', 'MSFT']);
    expect(result).toEqual([
      { symbol: 'AAPL', last: 210, change: 10, changePct: 5, bars: 2 },
      { symbol: 'MSFT', last: 396, change: -4, changePct: -1, bars: 2 },
    ]);
  });

  it('skips symbols with no bars', () => {
    expect(summarize({}, ['AAPL'])).toEqual([]);
  });
});

describe('rebaseSeries', () => {
  const series = [
    { date: '2026-01-02', AAPL: 200, MSFT: 400 },
    { date: '2026-01-03', AAPL: 210, MSFT: 396 },
  ];

  it('turns each symbol into percent change from its first price, keeping the prices', () => {
    expect(rebaseSeries(series, ['AAPL', 'MSFT'])).toEqual([
      { date: '2026-01-02', AAPL: 0, MSFT: 0, prices: { AAPL: 200, MSFT: 400 } },
      { date: '2026-01-03', AAPL: 5, MSFT: -1, prices: { AAPL: 210, MSFT: 396 } },
    ]);
  });

  it('starts a symbol at 0 on its first price when it has no earlier bars', () => {
    const late = [{ date: '2026-01-02', AAPL: 200 }, { date: '2026-01-03', AAPL: 210, MSFT: 50 }];
    const rows = rebaseSeries(late, ['AAPL', 'MSFT']);
    expect(rows[0].MSFT).toBeUndefined();
    expect(rows[1].MSFT).toBe(0);
  });
});

describe('rebasedLabel', () => {
  it('shows signed percent change with the actual price', () => {
    expect(rebasedLabel(5, 210)).toBe('+5.00% ($210.00)');
    expect(rebasedLabel(-1.234, 396)).toBe('-1.23% ($396.00)');
    expect(rebasedLabel(0, 200)).toBe('+0.00% ($200.00)');
  });
});
