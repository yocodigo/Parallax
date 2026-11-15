import { describe, expect, it } from 'vitest';
import { afterExit, afterExitSummary } from '../afterExit';
import { POST_EXIT_MIN } from '../settings';

// A bought SPY call (a bet on up), 580.00 on the underlying at the fill with a
// derived stop at 579.00 (1R is a point), closed at 15:20:10.
const call = {
  assetClass: 'option',
  optionType: 'call',
  direction: 'long',
  underlyingEntry: 580,
  underlyingStop: 579,
  underlyingStopSource: 'derived',
  openedAt: new Date('2026-11-10T15:16:37Z'),
  closedAt: new Date('2026-11-10T15:20:10Z'),
};
const minute = (m, l, h, vw = (l + h) / 2) => {
  const t = new Date(Date.parse('2026-11-10T15:00:00Z') + m * 60_000).toISOString();
  return { t, o: l, h, l, c: h, v: 1, vw };
};
// The exit's minute (15:20) averages 580.50; then 15 minutes after it, the
// highest at 581.70 (15:30); then 15:36, past the window, at 590.
const bars = [
  minute(19, 580, 580.6),
  minute(20, 580.2, 580.8, 580.5),
  minute(21, 580.3, 580.9),
  minute(30, 580.8, 581.7),
  minute(35, 580.1, 580.4),
  minute(36, 589, 590),
];

describe('afterExit', () => {
  it(`measures how far the underlying ran the trade's way in the ${POST_EXIT_MIN} minutes after the exit`, () => {
    expect(POST_EXIT_MIN).toBe(15);
    const result = afterExit(call, bars, null);

    expect(result).toMatchObject({ exitPrice: 580.5, bars: 3, stopSource: 'derived', t1: null, t1Reached: null });
    expect(result.ranFor).toBeCloseTo(1.2);
    expect(result.ranForR).toBeCloseTo(1.2);
  });

  it('says whether T1 was reached after the exit', () => {
    expect(afterExit(call, bars, 581.5).t1Reached).toBe(true);
    expect(afterExit(call, bars, 582).t1Reached).toBe(false);
  });

  it('reads a put the other way: down is its direction', () => {
    const put = { ...call, optionType: 'put', underlyingStop: 581 };

    const result = afterExit(put, bars, 580);

    // Lowest after the exit is 580.10, 0.40 under the exit's 580.50.
    expect(result.ranFor).toBeCloseTo(0.4);
    expect(result.t1Reached).toBe(false);
  });

  it('is zero, not negative, when price only went the other way', () => {
    const result = afterExit(call, [minute(20, 580.2, 580.8, 580.5), minute(21, 579, 580.4)], null);

    expect(result.ranFor).toBe(0);
  });

  it('gives points only without a stop on the underlying', () => {
    const result = afterExit({ ...call, underlyingStop: null, underlyingStopSource: null }, bars, null);

    expect(result).toMatchObject({ ranForR: null, stopSource: null });
    expect(result.ranFor).toBeCloseTo(1.2);
  });

  it('has nothing to measure for an open trade, one without an underlying entry, or without bars after the exit', () => {
    expect(afterExit({ ...call, closedAt: null }, bars, null)).toBeNull();
    expect(afterExit({ ...call, underlyingEntry: null }, bars, null)).toBeNull();
    expect(afterExit(call, bars.slice(0, 2), null)).toBeNull();
  });
});

describe('afterExitSummary', () => {
  const row = (ranFor, ranForR, stopSource, t1Reached) => ({ ranFor, ranForR, stopSource, t1Reached });

  it('gives how far the underlying ran after the exits, in points for all and in R apart by stop source', () => {
    const summary = afterExitSummary([
      row(0.2, 0.2, 'plan', true),
      row(1, 1, 'derived', false),
      row(0.5, 0.25, 'derived', null),
      row(0.8, null, null, true),
    ]);

    expect(summary.trades).toBe(4);
    expect(summary.points.percentiles.p50).toBeCloseTo(0.5);
    expect(summary.r.plan.trades).toBe(1);
    expect(summary.r.derived).toMatchObject({ trades: 2 });
    expect(summary.r.derived.percentiles.p50).toBeCloseTo(0.25);
    // T1 judged only where the day had one.
    expect(summary.t1).toEqual({ judged: 3, reached: 2 });
  });

  it('is empty without trades', () => {
    expect(afterExitSummary([])).toMatchObject({ trades: 0, t1: { judged: 0, reached: 0 } });
  });
});

