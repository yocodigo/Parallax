import { describe, expect, it } from 'vitest';
import { reviewEntry } from '../entryReview';
import { breakout, trap } from './fixtures/fourTouch';

const MINUTE = 60_000;
// 09:30 New York, where the session's clock-aligned 5m and 15m bars start.
// Every date used is a weekday on Eastern Daylight Time.
const openOf = (date) => Date.parse(`${date}T13:30:00Z`);

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

const minuteBars = (open, specs) => specs.flatMap((spec, k) => fiveMinute(open + k * 5 * MINUTE, spec));

const flat = (price) => ({ o: price, h: price + 0.1, l: price - 0.1, c: price });

// The previous session: 26 15m bars of nothing, so the Bollinger bands exist
// from the fill day's first bar.
const previousSession = (date) => minuteBars(openOf(date), Array.from({ length: 78 }, () => flat(10)));

// The fill day. Its 15m closes are the 5m closes at index 2, 5, 8 and 11
// (all 10, so no bias yet) and then index 14 at 12, which closes above the
// middle band and so crosses: the 15m bar covering 10:30-10:45.
//
// Index 6 dips to a swing low of 9.5 and index 10 peaks at a swing high of
// 10.8: the dealing range. Index 15 (10:45-10:50) is the first 5m entry
// candle after the cross: an up bar with no overlap on index 14, on more
// volume. Index 16 opens higher, so a fill in its first minutes is 0.3 above
// the entry candle's close.
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
  { o: 10.2, h: 11.05, l: 10.2, c: 11 },
  { o: 11.02, h: 12.05, l: 11, c: 12 },
  { o: 12.1, h: 12.6, l: 12.05, c: 12.5, v: 800 },
  { o: 12.8, h: 12.9, l: 12.7, c: 12.85 },
];

const barsFor = (prevDate, fillDate) => [
  ...previousSession(prevDate),
  ...minuteBars(openOf(fillDate), FILL_SESSION_SPECS),
];
const BARS = barsFor('2026-10-26', '2026-10-27');

// New York times on 2026-10-27.
const at = (nyTime) => new Date(`2026-10-27T${nyTime}:00-04:00`);

const trade = (overrides = {}) => ({
  assetClass: 'stock',
  direction: 'long',
  symbol: 'SPY',
  quantity: 100,
  openedAt: at('10:53'),
  optionType: null,
  ...overrides,
});

describe('reviewEntry', () => {
  it('has no review for a plan that was never entered', () => {
    expect(reviewEntry(trade({ openedAt: null }), BARS)).toBeNull();
  });

  it('finds the 15m cross setup with its ideal entry and S2 stop, and how far the fill chased it', () => {
    const review = reviewEntry(trade(), BARS);
    expect(review.bias).toBe('long');
    expect(review.setup).toEqual({
      name: 'band_cross',
      crossAt: '2026-10-27T14:30:00.000Z',
      entryAt: '2026-10-27T14:45:00.000Z',
      idealEntry: 12.5,
      idealStop: 12.05,
      risingVolume: true,
    });
    // The last minute closed before 10:53 closed at 12.8: 0.3 past the ideal
    // entry, against 0.45 of risk.
    expect(review.chaseR).toBeCloseTo(0.3 / 0.45);
  });

  it('measures the last closed 5m bar against the one before it', () => {
    expect(reviewEntry(trade(), BARS).entryCandle).toEqual({
      overlap: 0,
      volumeVsPrevious: 800 / 500,
      risingVolume: true,
    });
  });

  it('reads only bars that closed before the fill', () => {
    // At 10:47 the candle at 10:45 is still forming: the cross is known, the
    // entry isn't, and nothing from index 15 shows.
    const review = reviewEntry(trade({ openedAt: at('10:47') }), BARS);
    expect(review.setup).toBeNull();
    expect(review.chaseR).toBeNull();
    expect(review.entryCandle.overlap).not.toBe(0);
  });

  it('has no setup for a trade against the cross', () => {
    // A bought put bets the underlying falls; the day's cross is up.
    const put = trade({ assetClass: 'option', direction: 'long', optionType: 'put' });
    const review = reviewEntry(put, BARS);
    expect(review.bias).toBe('short');
    expect(review.setup).toBeNull();
    expect(review.chaseR).toBeNull();
  });

  it('measures the 1m room to the upper band from the fill price', () => {
    const { room } = reviewEntry(trade(), BARS);
    // The band is two deviations over the average of the twenty 1m closes
    // from 10:33 to 10:52 (the minute at 10:53 hadn't closed).
    const closes = [10.15, 10.5, ...Array(4).fill(10.2), 11, ...Array(4).fill(11.02), 12, ...Array(4).fill(12.1), 12.5];
    closes.push(12.8, 12.8, 12.8);
    const mean = closes.reduce((sum, c) => sum + c, 0) / closes.length;
    const deviation = Math.sqrt(closes.reduce((sum, c) => sum + (c - mean) ** 2, 0) / closes.length);
    expect(room.distance).toBeCloseTo(mean + 2 * deviation - 12.8);
    expect(room.needed).toBeGreaterThan(0);
  });

  it('flags a fill inside a lockout window and one inside the middle of the range', () => {
    expect(reviewEntry(trade({ openedAt: at('09:40') }), BARS).inLockout).toBe(true);
    expect(reviewEntry(trade(), BARS).inLockout).toBe(false);

    // At 10:36 the last minute closed at 10.2: 54% of the way from the swing
    // low at 9.5 to the swing high at 10.8. At 10:53 the price is far beyond.
    expect(reviewEntry(trade({ openedAt: at('10:36') }), BARS).midRange).toBe(true);
    expect(reviewEntry(trade(), BARS).midRange).toBe(false);
  });

  it('flags a pressure date and a Gann seasonal date by the New York day of the fill', () => {
    expect(reviewEntry(trade(), BARS)).toMatchObject({ pressureDate: false, seasonalDate: null });

    const bars = barsFor('2026-10-28', '2026-10-29');
    const onThe29th = trade({ openedAt: new Date('2026-10-29T10:53:00-04:00') });
    expect(reviewEntry(onThe29th, bars).pressureDate).toBe(true);

    // The day before the 23rd, and not a pressure date.
    const bars22nd = barsFor('2026-09-21', '2026-09-22');
    const onThe22nd = trade({ openedAt: new Date('2026-09-22T10:53:00-04:00') });
    expect(reviewEntry(onThe22nd, bars22nd)).toMatchObject({ pressureDate: false, seasonalDate: '09-23' });
  });

  describe('four-touch line', () => {
    // The example bars as 1m bars from the open.
    const asMinutes = (ohlc) =>
      ohlc.map((bar, k) => ({ t: new Date(openOf('2026-10-27') + k * MINUTE).toISOString(), v: 100, ...bar }));

    it('gives the 4xBD in a short trade’s direction, with its grade', () => {
      const bars = asMinutes(breakout);
      const review = reviewEntry(trade({ direction: 'short', openedAt: at('09:56') }), bars);
      expect(review.fourTouch).toMatchObject({
        timeframe: '1m',
        kind: '4xBD',
        status: 'valid',
        grade: { grade: 'A' },
        brokeAt: bars[22].t,
      });
    });

    it('has none for a long trade against it', () => {
      const bars = asMinutes(breakout);
      expect(reviewEntry(trade({ direction: 'long', openedAt: at('09:56') }), bars).fourTouch).toBeNull();
    });

    it('counts a trap for the trade the other way', () => {
      const bars = asMinutes(trap);
      const long = reviewEntry(trade({ direction: 'long', openedAt: at('09:54') }), bars);
      expect(long.fourTouch).toMatchObject({ kind: '4xBD', status: 'trap' });
      expect(reviewEntry(trade({ direction: 'short', openedAt: at('09:54') }), bars).fourTouch).toBeNull();
    });
  });
});
