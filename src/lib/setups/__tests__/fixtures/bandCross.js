// Test bars for the 15m band cross (setups.md 3.1): a quiet previous session
// so the bands exist, then a fill day that crosses up at 10:30-10:45 and
// prints its first 5m entry candle at 10:45-10:50 (2026-10-27 in BARS).

export const MINUTE = 60_000;
// 09:30 New York, where the session's clock-aligned 5m and 15m bars start.
// Every date used is a weekday on Eastern Daylight Time.
export const openOf = (date) => Date.parse(`${date}T13:30:00Z`);

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

export const barsFor = (prevDate, fillDate) => [
  ...previousSession(prevDate),
  ...minuteBars(openOf(fillDate), FILL_SESSION_SPECS),
];
export const BARS = barsFor('2026-10-26', '2026-10-27');
