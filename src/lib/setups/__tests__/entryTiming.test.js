import { describe, expect, it } from 'vitest';
import { entryTiming, entryTimingSummary, nearestTrigger } from '../entryTiming';
import { MINUTE, openOf } from './fixtures/bandCross';
import { breakout } from './fixtures/fourTouch';

// New York times on 2026-10-27.
const at = (nyTime) => new Date(`2026-10-27T${nyTime}:00-04:00`);

// The breakout as 1m bars from the open, then quiet bars where it ended: the
// break is bar 22 (09:52) and it was confirmed with bar 25 (09:55-09:56).
const BARS = [...breakout, ...Array.from({ length: 10 }, () => ({ o: 281, h: 281.2, l: 280.8, c: 281 }))].map(
  (bar, k) => ({ t: new Date(openOf('2026-10-27') + k * MINUTE).toISOString(), v: 100, ...bar })
);

const short = (nyTime) => ({ assetClass: 'stock', direction: 'short', symbol: 'SPY', optionType: null, openedAt: at(nyTime) });

describe('entryTiming', () => {
  // 09:56 is exactly when bar 25 closed: a trigger closed at the fill is on it.
  it('is on the trigger when filled before the bar after it closed', () => {
    expect(entryTiming(short('09:56'), BARS)).toMatchObject({
      timing: 'on',
      bars: 0,
      setup: { detector: 'four_touch', timeframe: '1m' },
    });
  });

  it('is late by the bars that closed after the trigger, up to DETECTED_MAX_BARS', () => {
    expect(entryTiming(short('09:58'), BARS)).toMatchObject({ timing: 'late', bars: 2 });
    expect(entryTiming(short('10:00'), BARS)).toMatchObject({ timing: 'none' });
  });

  it('is early when the trigger bar closed after the fill, by how many bars later', () => {
    // At 09:54 the break was still pending; bar 25 confirmed it, closing at 09:56.
    expect(entryTiming(short('09:54'), BARS)).toMatchObject({
      timing: 'early',
      bars: 2,
      setup: { detector: 'four_touch', timeframe: '1m' },
    });
  });

  it('counts early in bars that exist, as late is, when the feed skipped a minute', () => {
    // Without the 09:54 minute, bar 25 (closing 09:56) is the 1st bar to close
    // after a 09:54 fill and the break is still pending there; bar 26, the
    // first quiet bar (closing 09:57), confirms it. That is the 2nd bar after
    // the fill: early by 2, where clock slots would have said 3.
    const skipped = BARS.filter((bar) => bar.t !== at('09:54').toISOString());
    expect(entryTiming(short('09:54'), skipped)).toMatchObject({ timing: 'early', bars: 2 });
  });

  it("times the entry against the strategy's own detector when it names one", () => {
    expect(entryTiming(short('09:56'), BARS, { detector: 'band_cross' })).toMatchObject({ timing: 'none' });
    expect(entryTiming(short('09:56'), BARS, { detector: 'four_touch' })).toMatchObject({ timing: 'on' });
  });

  it('has no timing for a plan never entered or without bars', () => {
    expect(entryTiming({ ...short('09:56'), openedAt: null }, BARS)).toBeNull();
    expect(entryTiming(short('09:56'), [])).toBeNull();
  });
});

describe('nearestTrigger', () => {
  const candidate = (timing, bars) => ({ timing, bars, setup: { detector: 'four_touch', timeframe: '1m' } });

  it('takes the trigger nearest the fill, early or not', () => {
    expect(nearestTrigger([candidate('late', 3), candidate('early', 1)])).toMatchObject({ timing: 'early', bars: 1 });
    expect(nearestTrigger([candidate('early', 2), candidate('on', 0)])).toMatchObject({ timing: 'on' });
  });

  it('prefers the trigger already there at the fill at the same distance', () => {
    expect(nearestTrigger([candidate('early', 2), candidate('late', 2)])).toMatchObject({ timing: 'late', bars: 2 });
  });

  it('is no trigger without candidates', () => {
    expect(nearestTrigger([])).toEqual({ timing: 'none' });
  });
});

describe('entryTimingSummary', () => {
  const row = (timing, symbol, netPnl, mae, maeR = null, stopSource = maeR === null ? null : 'derived') => ({
    timing,
    symbol,
    netPnl,
    heat: { mae, maeR, stopSource },
  });

  it('gives each group its trades, net P/L, and heat: points per underlying, R by where the stop came from', () => {
    const groups = entryTimingSummary([
      row('early', 'SPY', -30, 1.2, 1.5),
      row('early', 'SPY', 10, 0.4),
      row('early', 'SPY', 0, 0.9, 0.9, 'plan'),
      row('on', 'SPY', 25, 0.2, 0.25),
      row('none', 'QQQ', -5, 0.8),
    ]);

    expect(groups.map((g) => [g.timing, g.trades, g.netPnl])).toEqual([
      ['early', 3, -20],
      ['on', 1, 25],
      ['late', 0, 0],
      ['none', 1, -5],
    ]);
    expect(groups[0].heatPoints).toEqual([{ symbol: 'SPY', trades: 3, percentiles: { p50: 0.9, p75: 1.2, p90: 1.2 } }]);
    // R from a planned stop and from a derived one are never pooled.
    expect(groups[0].heatR).toEqual({
      plan: { trades: 1, percentiles: { p50: 0.9, p75: 0.9, p90: 0.9 } },
      derived: { trades: 1, percentiles: { p50: 1.5, p75: 1.5, p90: 1.5 } },
    });
  });

  it('leaves heat out of a trade with no underlying measure', () => {
    const [early] = entryTimingSummary([{ timing: 'early', symbol: 'SPY', netPnl: 5, heat: null }]);
    expect(early).toMatchObject({ trades: 1, heatPoints: [], heatR: { plan: { trades: 0 }, derived: { trades: 0 } } });
  });
});
