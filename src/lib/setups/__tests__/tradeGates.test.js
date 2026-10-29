import { describe, expect, it } from 'vitest';
import { gradeTradeGates } from '../tradeGates';

const MINUTE = 60_000;
// 09:30 New York, where the session's clock-aligned 5m and 15m bars start.
// Both dates are weekdays on Eastern Daylight Time.
const openOf = (date) => Date.parse(`${date}T13:30:00Z`);
const PREV_DAY = openOf('2026-10-26');
const FILL_DAY = openOf('2026-10-27');
// New York times on the fill day, the clock the gates keep.
const at = (nyTime) => new Date(`2026-10-27T${nyTime}:00-04:00`);

// Five minute bars adding up to one 5m bar with exactly this o/h/l/c: the
// high lands on the second minute, the low on the third, the close on the
// last. Specs are ordinary bars (h at or above o and c, l at or below).
function fiveMinute(start, { o, h, l, c, v = 500 }) {
  const minute = (k, bar) => ({ t: new Date(start + k * MINUTE).toISOString(), v: v / 5, ...bar });
  return [
    minute(0, { o, h: o, l: o, c: o }),
    minute(1, { o, h, l: o, c: o }),
    minute(2, { o, h: o, l, c: o }),
    minute(3, { o, h: o, l: o, c: o }),
    minute(4, { o, h: Math.max(o, c), l: Math.min(o, c), c }),
  ];
}

// Minute bars for a session, from a list of 5m specs starting at the open.
const minuteBars = (open, specs) => specs.flatMap((spec, k) => fiveMinute(open + k * 5 * MINUTE, spec));

const flat = (price) => ({ o: price, h: price + 0.1, l: price - 0.1, c: price });

// The previous session, flat at 10 all day: 26 15m bars, enough for the
// Bollinger bands to exist from the fill day's first bar.
const PREVIOUS_SESSION = minuteBars(PREV_DAY, Array(78).fill(flat(10)));

// The fill day. Its 15m closes are the 5m closes at index 2, 5, 8 and 11
// (all 10, so no bias yet) and then index 14 at 12, which closes above the
// middle band and so crosses: the 15m bar covering 10:30-10:45.
//
// Index 6 dips to a swing low of 9.5 and index 10 peaks at a swing high of
// 10.8; those are the dealing range the location gate judges the entry
// against. Index 14 is the last 5m bar to close before the fill, and barely
// overlaps index 13. Index 15 is after the fill and must be ignored: taken
// as the entry candle it would overlap completely.
const FILL_SESSION_SPECS = [
  flat(10),
  flat(10),
  flat(10),
  flat(10),
  flat(10),
  flat(10),
  { o: 10, h: 10.05, l: 9.5, c: 9.9 },
  { o: 9.9, h: 10.1, l: 9.85, c: 10 },
  flat(10),
  { o: 10, h: 10.2, l: 9.95, c: 10.1 },
  { o: 10.1, h: 10.8, l: 10.05, c: 10.2 },
  { o: 10.2, h: 10.3, l: 10.12, c: 10 },
  { o: 10.15, h: 10.6, l: 10.1, c: 10.5 },
  { o: 10.5, h: 11.05, l: 10.45, c: 11 },
  { o: 11.02, h: 12.05, l: 11, c: 12 },
  { o: 11.5, h: 12.04, l: 11.05, c: 11.6 },
];

const BARS = [...PREVIOUS_SESSION, ...minuteBars(FILL_DAY, FILL_SESSION_SPECS)];

// A SPY stock trade entered at 10:47, two minutes after the 15m cross closed.
const trade = (overrides = {}) => ({
  assetClass: 'stock',
  direction: 'long',
  symbol: 'SPY',
  quantity: 100,
  openedAt: at('10:47'),
  entryPrice: 12,
  stopRule: 'S2',
  optionType: null,
  ...overrides,
});

const records = { dailyPlan: { id: 1 }, planEntry: { emotion: 'calm', mistakes: [] } };

describe('gradeTradeGates', () => {
  it('grades every gate of a trade taken on the 15m cross', () => {
    expect(gradeTradeGates(trade(), BARS, records)).toEqual({
      window: 'met',
      direction: 'met',
      entry: 'met',
      location: 'met',
      target: 'met',
      state: 'met',
      stop: 'met',
    });
  });

  it('reads the direction from the underlying, not the contract', () => {
    // A bought put is `direction: 'long'` but bets the underlying falls, so
    // the day's cross up went against it.
    const put = trade({ assetClass: 'option', direction: 'long', optionType: 'put', quantity: 2 });
    expect(gradeTradeGates(put, BARS, records)).toMatchObject({ direction: 'missed', size: 'met' });

    const call = trade({ assetClass: 'option', direction: 'long', optionType: 'call', quantity: 2 });
    expect(gradeTradeGates(call, BARS, records)).toMatchObject({ direction: 'met' });
  });

  it('ignores the bars that had not closed at the fill', () => {
    // Index 15 closed after the fill and overlaps index 14 completely; the
    // entry gate must still judge index 14, the last bar closed before it.
    expect(gradeTradeGates(trade(), BARS, records).entry).toBe('met');
  });

  it("can't judge the direction before the 15m bar that crossed has closed", () => {
    // 10:44, a minute before the crossing bar closes: nothing had set a bias.
    expect(gradeTradeGates(trade({ openedAt: at('10:44') }), BARS, records)).toMatchObject({
      direction: 'unknown',
      window: 'met',
    });
  });

  it('misses the window gate inside a lockout', () => {
    expect(gradeTradeGates(trade({ openedAt: at('11:30') }), BARS, records).window).toBe('missed');
  });

  it('grades only what was recorded for a plan that was never entered', () => {
    const plan = trade({ openedAt: null, entryPrice: null });
    expect(gradeTradeGates(plan, BARS, records)).toEqual({
      window: 'unknown',
      direction: 'unknown',
      entry: 'unknown',
      location: 'unknown',
      target: 'met',
      state: 'met',
      stop: 'met',
    });
  });

  it('leaves the bar gates unknown without bars', () => {
    expect(gradeTradeGates(trade(), [], records)).toEqual({
      window: 'met',
      direction: 'unknown',
      entry: 'unknown',
      location: 'unknown',
      target: 'met',
      state: 'met',
      stop: 'met',
    });
  });

  it('grades an option by its contract count and a stock not at all', () => {
    const option = { assetClass: 'option', optionType: 'call' };
    expect(gradeTradeGates(trade({ ...option, quantity: 5 }), BARS, records).size).toBe('missed');
    expect(gradeTradeGates(trade(), BARS, records)).not.toHaveProperty('size');
  });

  it('passes the day plan and the plan entry through to their gates', () => {
    expect(gradeTradeGates(trade(), BARS, { dailyPlan: null, planEntry: null })).toMatchObject({
      target: 'missed',
      state: 'unknown',
    });
    expect(
      gradeTradeGates(trade({ stopRule: null }), BARS, {
        ...records,
        planEntry: { emotion: 'fomo', mistakes: [] },
      })
    ).toMatchObject({ state: 'missed', stop: 'unknown' });
  });
});
