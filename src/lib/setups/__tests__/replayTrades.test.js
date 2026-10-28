import { describe, expect, it } from 'vitest';
import { fillBarIndex, replayTrades, tradeBias } from '../replayTrades';

const MINUTE = 60_000;
const OPEN = Date.parse('2026-10-26T13:30:00Z');
const minutes = (count, bar = { o: 500, h: 500.5, l: 499.5, c: 500 }) =>
  Array.from({ length: count }, (_, k) => ({ t: new Date(OPEN + k * MINUTE).toISOString(), ...bar }));

describe('tradeBias', () => {
  it('takes a bought call as long and a bought put as short', () => {
    expect(tradeBias({ assetClass: 'option', direction: 'long', optionType: 'call' })).toBe('long');
    expect(tradeBias({ assetClass: 'option', direction: 'long', optionType: 'put' })).toBe('short');
  });

  it('flips for a sold option', () => {
    expect(tradeBias({ assetClass: 'option', direction: 'short', optionType: 'put' })).toBe('long');
  });

  it("takes a stock trade's direction", () => {
    expect(tradeBias({ assetClass: 'stock', direction: 'short' })).toBe('short');
  });
});

describe('fillBarIndex', () => {
  const bars = minutes(5);

  it('finds the 1m bar the fill happened in', () => {
    expect(fillBarIndex(bars, new Date(OPEN + 2 * MINUTE + 30_000))).toBe(2);
    expect(fillBarIndex(bars, new Date(OPEN + 3 * MINUTE))).toBe(3);
  });

  it('is null when no bar covers the fill', () => {
    expect(fillBarIndex(bars, new Date(OPEN - 1))).toBeNull();
    expect(fillBarIndex(bars, new Date(OPEN + 5 * MINUTE))).toBeNull();
  });
});

describe('replayTrades', () => {
  const trade = (openedAt) => ({ assetClass: 'stock', direction: 'long', openedAt: new Date(openedAt) });

  it('replays each rule set over the trades and sums each up', () => {
    const bars = minutes(30);
    const trades = [trade(OPEN + 10 * MINUTE + 5_000), trade(OPEN + 20 * MINUTE)];
    const report = replayTrades(trades, () => bars, [['S2'], ['S1', 'S2']]);
    expect(report.replayed).toBe(2);
    expect(report.skipped).toBe(0);
    expect(report.ruleSets.map((set) => [set.rules, set.trades])).toEqual([
      [['S2'], 2],
      [['S1', 'S2'], 2],
    ]);
  });

  it('replays each trade in its own direction', () => {
    // A bought put is short: bar 12 closing above the fill bar's 500.6 high is
    // an S2 exit for it, though it wouldn't be for a long.
    const bars = minutes(30);
    bars[10] = { ...bars[10], o: 500, h: 500.6, l: 499.8, c: 500.2 };
    bars[12] = { ...bars[12], o: 500.3, h: 501, l: 500.2, c: 500.9 };
    const put = { assetClass: 'option', direction: 'long', optionType: 'put', openedAt: new Date(OPEN + 10 * MINUTE) };
    expect(replayTrades([put], () => bars, [['S2']]).ruleSets[0].byReason).toEqual({ S2: 1 });
  });

  it('skips trades without a bar covering the fill', () => {
    const report = replayTrades([trade(OPEN + 90 * MINUTE)], () => minutes(30), [['S2']]);
    expect(report).toMatchObject({ replayed: 0, skipped: 1 });
    expect(report.ruleSets[0].trades).toBe(0);
  });
});
