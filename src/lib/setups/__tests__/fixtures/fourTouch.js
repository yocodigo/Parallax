// Test bars for the four-touch detector, from the user's four-touch-breakout
// example: a shelf of support near 300 touched four times, then either a
// breakdown that is accepted or a break that is reclaimed (a trap).
//
// Fourteen warm-up bars come first so the 14-bar ATR has history. They trend
// down with each low below the last, so they hold no swing lows.
const warmUp = Array.from({ length: 14 }, (_, k) => {
  const o = 362 - 3 * k;
  return { o, h: o + 2, l: o - 5, c: o - 3 };
});

// Shared bars 0-7. Touches at 1, 3, and 5 establish the line; bar 6 merges
// into touch 3, and bar 7 starts the 4th approach.
const shared = [
  { o: 320, h: 322, l: 312, c: 314 },
  { o: 314, h: 316, l: 300.5, c: 303 },
  { o: 303, h: 310, l: 302, c: 308 },
  { o: 308, h: 309, l: 300.5, c: 302 },
  { o: 302, h: 306, l: 301, c: 305 },
  { o: 305, h: 305, l: 300.2, c: 301 },
  { o: 301, h: 303, l: 300.3, c: 301 },
  { o: 301, h: 302, l: 300.1, c: 300.6 },
];

// Index of shared bar 0 in the full sequences.
export const W = warmUp.length;

// The break bar (8) is scaled up from the example's 3x body, as setups.md
// asks: bars 4-7 have bodies 3, 4, 0, and 0.4 (average 1.85), so its body of
// 8.0 is over 4x.
export const breakout = [
  ...warmUp,
  ...shared,
  { o: 300.6, h: 300.8, l: 292, c: 292.6 },
  { o: 292.6, h: 293, l: 289, c: 290 },
  { o: 290, h: 291, l: 284, c: 286 },
  { o: 286, h: 287, l: 279, c: 281 },
];

export const trap = [
  ...warmUp,
  ...shared,
  { o: 300.6, h: 301, l: 292, c: 292.6 },
  { o: 292.6, h: 303, l: 292.2, c: 302 },
  { o: 302, h: 312, l: 301.5, c: 310 },
  { o: 310, h: 320, l: 309, c: 318 },
];
