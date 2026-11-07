import { describe, it, expect } from 'vitest';
import { reshapeBars, summarize, rebaseSeries, rebasedLabel, relativeStrength, relativeLabel } from '../bars';

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

describe('relativeStrength', () => {
  const rebased = [
    { date: 'a', prices: { AAPL: 100, SPY: 400 }, AAPL: 0, SPY: 0 },
    { date: 'b', prices: { AAPL: 110, SPY: 404 }, AAPL: 10, SPY: 1 },
    { date: 'c', prices: { AAPL: 99, SPY: 412 }, AAPL: -1, SPY: 3 },
  ];

  it('is each line minus the benchmark, with the benchmark flat at 0', () => {
    const rows = relativeStrength(rebased, ['AAPL', 'SPY'], 'SPY');

    expect(rows.map((r) => r.AAPL)).toEqual([0, 9, -4]);
    expect(rows.map((r) => r.SPY)).toEqual([0, 0, 0]);
  });

  it('keeps the dates and the actual prices for the tooltip', () => {
    const [row] = relativeStrength(rebased, ['AAPL', 'SPY'], 'SPY');

    expect(row).toMatchObject({ date: 'a', prices: { AAPL: 100, SPY: 400 } });
  });

  it('leaves a point out where the benchmark or the line has no price', () => {
    const gappy = [
      { date: 'a', prices: { AAPL: 100 }, AAPL: 0 },
      { date: 'b', prices: { AAPL: 101, SPY: 404 }, AAPL: 1, SPY: 1 },
    ];
    const rows = relativeStrength(gappy, ['AAPL', 'SPY'], 'SPY');

    expect(rows[0]).not.toHaveProperty('AAPL');
    expect(rows[1].AAPL).toBe(0);
  });

  it('does not change the rebased rows it was given', () => {
    relativeStrength(rebased, ['AAPL', 'SPY'], 'SPY');

    expect(rebased[1].AAPL).toBe(10);
  });
});

describe('relativeLabel', () => {
  it('shows signed percentage points with the actual price', () => {
    expect(relativeLabel(2.5, 210)).toBe('+2.50 pts ($210.00)');
    expect(relativeLabel(-1.234, 396)).toBe('-1.23 pts ($396.00)');
  });
});
