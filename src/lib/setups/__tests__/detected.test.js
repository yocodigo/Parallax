import { describe, expect, it } from 'vitest';
import { clearsWindow, detectSetups, strategySetup } from '../detected';
import { BARS, MINUTE, openOf } from './fixtures/bandCross';
import { breakout, trap } from './fixtures/fourTouch';
import { reversalBars, TARGET_POOL } from './fixtures/reversalSequence';

// New York times on 2026-10-27, the fixtures' day.
const at = (nyTime) => new Date(`2026-10-27T${nyTime}:00-04:00`);

// Plain bars as 1m bars from the open, or one every 5 minutes, which the 5m
// bars then match one for one.
const asMinutes = (ohlc, every = 1) =>
  ohlc.map((bar, k) => ({ t: new Date(openOf('2026-10-27') + k * every * MINUTE).toISOString(), v: 100, ...bar }));

const trade = (overrides = {}) => ({
  assetClass: 'stock',
  direction: 'long',
  symbol: 'SPY',
  openedAt: at('10:53'),
  optionType: null,
  ...overrides,
});

const of = (found, detector, timeframe) =>
  found.filter((s) => s.detector === detector && (!timeframe || s.timeframe === timeframe));

describe('detectSetups', () => {
  it('finds nothing for a plan that was never entered, or without bars', () => {
    expect(detectSetups(trade({ openedAt: null }), BARS)).toEqual([]);
    expect(detectSetups(trade(), [])).toEqual([]);
  });

  describe('band cross', () => {
    // The fixture's entry candle (10:45-10:50) closes at 12.5, 0.155 under
    // the 1m upper band where half a 1m ATR is 0.170: no room. Closing it at
    // 12.3 instead leaves 0.31.
    const withRoom = BARS.map((bar) => (bar.t === '2026-10-27T14:49:00.000Z' ? { ...bar, c: 12.3 } : bar));

    it('is complete once the entry candle closed with room to the 1m band, counting the 5m bars since', () => {
      expect(of(detectSetups(trade(), withRoom), 'band_cross')).toEqual([
        {
          detector: 'band_cross',
          timeframe: '5m',
          direction: 'long',
          status: 'complete',
          grade: null,
          completedAt: '2026-10-27T14:45:00.000Z',
          barsSince: 0,
        },
      ]);
      // At 11:08 three more 5m bars have closed (only the fixture's last one
      // is real; the rest of the session is quiet).
      const later = [...withRoom, ...quietAfter(withRoom, 3)];
      expect(of(detectSetups(trade({ openedAt: at('11:08') }), later), 'band_cross')[0].barsSince).toBe(3);
    });

    it('has no room when the entry candle closed too near the 1m band', () => {
      expect(of(detectSetups(trade(), BARS), 'band_cross')[0].status).toBe('no_room');
    });

    it('is not the trade’s setup when the cross went the other way', () => {
      const put = trade({ assetClass: 'option', optionType: 'put' });
      expect(of(detectSetups(put, BARS), 'band_cross')).toEqual([]);
    });

    it('reads nothing that closed after the fill', () => {
      expect(of(detectSetups(trade({ openedAt: at('10:47') }), BARS), 'band_cross')).toEqual([]);
    });
  });

  describe('four-touch break', () => {
    it('gives the break the trade’s way with its status and grade, completed when it was confirmed', () => {
      const bars = asMinutes(breakout);
      // The break bar is 22 (09:52); N_RECLAIM bars later, at 25 (09:55), it
      // was confirmed.
      expect(of(detectSetups(trade({ direction: 'short', openedAt: at('09:56') }), bars), 'four_touch', '1m')).toEqual([
        {
          detector: 'four_touch',
          timeframe: '1m',
          direction: 'short',
          status: 'valid',
          grade: 'A',
          completedAt: bars[25].t,
          barsSince: 0,
        },
      ]);
      expect(of(detectSetups(trade({ direction: 'long', openedAt: at('09:56') }), bars), 'four_touch')).toEqual([]);
    });

    it('finds the break on the 5m bars too', () => {
      // 26 bars from 9:30, the last one 11:35-11:40.
      const bars = asMinutes(breakout, 5);
      const [found] = of(detectSetups(trade({ direction: 'short', openedAt: at('11:40') }), bars), 'four_touch', '5m');
      expect(found).toMatchObject({ status: 'valid', grade: 'A', completedAt: bars[25].t, barsSince: 0 });
    });

    it('is pending, from the break bar, before it was confirmed', () => {
      const bars = asMinutes(breakout);
      const [found] = of(detectSetups(trade({ direction: 'short', openedAt: at('09:54') }), bars), 'four_touch', '1m');
      expect(found).toMatchObject({ status: 'pending', completedAt: bars[22].t, barsSince: 1 });
    });

    it('counts a trap for the trade the other way, completed at the reclaim', () => {
      const bars = asMinutes(trap);
      const [found] = of(detectSetups(trade({ openedAt: at('09:54') }), bars), 'four_touch', '1m');
      expect(found).toMatchObject({ direction: 'long', status: 'trap', completedAt: bars[23].t, barsSince: 0 });
    });
  });

  describe('reversal sequence', () => {
    // The fixture's displacement already reaches its T1 (the buyside pool's
    // 103.0); with that pool raised to 106, T1 lies ahead.
    const withTargetAhead = () => {
      const bars = reversalBars();
      bars[TARGET_POOL[0]] = { ...bars[TARGET_POOL[0]], h: 106 };
      bars[TARGET_POOL[1]] = { ...bars[TARGET_POOL[1]], h: 106.04 };
      return bars;
    };

    it('is complete once the gap behind the displacement exists', () => {
      // The sequence completes with bar 67 (10:37), the bar that leaves the gap.
      const bars = asMinutes(withTargetAhead());
      expect(of(detectSetups(trade({ openedAt: at('10:38') }), bars), 'reversal', '1m')).toEqual([
        {
          detector: 'reversal',
          timeframe: '1m',
          direction: 'long',
          status: 'complete',
          grade: null,
          completedAt: bars[67].t,
          barsSince: 0,
        },
      ]);
      expect(of(detectSetups(trade({ openedAt: at('10:37') }), bars), 'reversal', '1m')).toEqual([]);
    });

    it('is invalidated by a close beyond the sweep extreme', () => {
      const bars = asMinutes([...withTargetAhead(), { o: 103, h: 103, l: 96, c: 96.5 }]);
      const [found] = of(detectSetups(trade({ openedAt: at('10:39') }), bars), 'reversal', '1m');
      expect(found).toMatchObject({ status: 'invalidated', barsSince: 1 });
    });

    it('is spent once price reaches T1, even on the bars that complete it', () => {
      const ahead = asMinutes([...withTargetAhead(), { o: 104, h: 106.5, l: 103.8, c: 106.2 }]);
      expect(of(detectSetups(trade({ openedAt: at('10:39') }), ahead), 'reversal', '1m')[0].status).toBe('target_hit');
      const fixture = asMinutes(reversalBars());
      expect(of(detectSetups(trade({ openedAt: at('10:38') }), fixture), 'reversal', '1m')[0].status).toBe('target_hit');
    });
  });

  describe('three-gate entry', () => {
    // Twenty quiet bars, then a sweep of 100 that closes back above it in the
    // top half of its range, then a bar trading above the sweep bar's high.
    const quiet = Array.from({ length: 20 }, (_, k) =>
      k % 2 ? { o: 98.2, h: 98.7, l: 97.7, c: 98 } : { o: 98, h: 98.5, l: 97.5, c: 98.2 }
    );
    const bars = asMinutes([
      ...quiet,
      { o: 99.8, h: 100.6, l: 99.0, c: 100.5 },
      { o: 100.5, h: 100.8, l: 100.3, c: 100.7 },
    ]);
    const level = (overrides) => ({ kind: 'prior_day_low', price: 100, tier: 1, side: 'below', formedAt: null, ...overrides });
    const fill = trade({ openedAt: at('09:52') });

    it('fires at a tier 1 or 2 level, naming it, completed at the trigger', () => {
      expect(of(detectSetups(fill, bars, { levels: [level()] }), 'three_gate', '1m')).toEqual([
        {
          detector: 'three_gate',
          timeframe: '1m',
          direction: 'long',
          status: 'complete',
          grade: null,
          completedAt: bars[21].t,
          barsSince: 0,
          level: { kind: 'prior_day_low', price: 100 },
        },
      ]);
    });

    it('skips tier 3 levels, sloped lines, and levels that formed after the sweep', () => {
      const levels = [
        level({ kind: 'round', tier: 3 }),
        level({ kind: 'four_touch_1m', tier: 2, slope: 0 }),
        level({ kind: 'opening_range_low', tier: 2, formedAt: bars[21].t }),
      ];
      expect(of(detectSetups(fill, bars, { levels }), 'three_gate')).toEqual([]);
    });

    it('lets the first bar after a level formed sweep it', () => {
      // formedAt is a close: the sweep bar starts at the moment it formed.
      const levels = [level({ kind: 'opening_range_low', tier: 2, formedAt: bars[20].t })];
      expect(of(detectSetups(fill, bars, { levels }), 'three_gate', '1m')).toHaveLength(1);
    });
  });
});

// `count` quiet 5m periods after the last bar of `bars`, at its close.
function quietAfter(bars, count) {
  const last = bars.at(-1);
  const start = Date.parse(last.t) + MINUTE;
  return Array.from({ length: count * 5 }, (_, k) => ({
    t: new Date(start + k * MINUTE).toISOString(),
    o: last.c,
    h: last.c,
    l: last.c,
    c: last.c,
    v: 100,
  }));
}

describe('clearsWindow', () => {
  const setup = (overrides) => ({ detector: 'band_cross', status: 'complete', grade: null, barsSince: 0, ...overrides });

  it('takes a complete setup, or a valid grade A four-touch break, within DETECTED_MAX_BARS of the fill', () => {
    expect(clearsWindow(setup())).toBe(true);
    expect(clearsWindow(setup({ barsSince: 3 }))).toBe(true);
    expect(clearsWindow(setup({ barsSince: 4 }))).toBe(false);
    expect(clearsWindow(setup({ status: 'no_room' }))).toBe(false);
    expect(clearsWindow(setup({ detector: 'reversal', status: 'invalidated' }))).toBe(false);
    expect(clearsWindow(setup({ detector: 'four_touch', status: 'valid', grade: 'A' }))).toBe(true);
    expect(clearsWindow(setup({ detector: 'four_touch', status: 'valid', grade: 'B' }))).toBe(false);
    expect(clearsWindow(setup({ detector: 'four_touch', status: 'trap', grade: 'A' }))).toBe(false);
  });
});

describe('strategySetup', () => {
  const setup = (overrides) => ({ detector: 'four_touch', timeframe: '1m', status: 'valid', grade: 'A', barsSince: 0, ...overrides });

  it("picks the strategy's detector within DETECTED_MAX_BARS, one there to trade first, then the most recent", () => {
    const detected = [
      setup({ detector: 'band_cross', status: 'complete' }),
      setup({ timeframe: '1m', status: 'weak', barsSince: 0 }),
      setup({ timeframe: '5m', status: 'valid', barsSince: 2 }),
    ];
    expect(strategySetup(detected, 'four_touch')).toEqual(detected[2]);
    expect(strategySetup(detected.slice(0, 2), 'four_touch')).toEqual(detected[1]);
  });

  it('is null when the detector found nothing recent', () => {
    expect(strategySetup([setup({ barsSince: 4 })], 'four_touch')).toBeNull();
    expect(strategySetup([setup()], 'reversal')).toBeNull();
  });
});
