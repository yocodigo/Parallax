import { describe, expect, it } from 'vitest';
import { levelMap } from '../levels';
import { levelLocation } from '../location';
import { breakout, W } from './fixtures/fourTouch';

// Tuesday 2026-10-27, on Eastern Daylight Time.
const DAY = '2026-10-27';
const at = (nyTime) => new Date(`${DAY}T${nyTime}:00-04:00`);
const clock = (minutes) => {
  const total = 9 * 60 + 30 + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const bar = (minute, { h, l, c, v = 100 }) => ({ t: at(clock(minute)).toISOString(), o: c, h, l, c, v });
const daily = (date, h, l) => ({ t: `${date}T04:00:00Z`, o: l, h, l, c: h, v: 1000 });

// Fifteen quiet bars around 100.5 (the opening range: 100.3 to 100.7), so the
// 1m ATR is about 0.4 and LEVEL_NEAR about 0.2.
const QUIET = Array.from({ length: 15 }, (_, k) => bar(k, { h: 100.7, l: 100.3, c: 100.5 }));

// 9:45 closes above 101 on rising volume, 9:46 and 9:47 hold above it
// (accepted), then price drifts back to 101.1, near the broken level.
const BREAK_UP = [
  ...QUIET,
  bar(15, { h: 101.4, l: 100.6, c: 101.3, v: 200 }),
  bar(16, { h: 101.5, l: 101.2, c: 101.4 }),
  bar(17, { h: 101.4, l: 101.1, c: 101.3 }),
  ...Array.from({ length: 5 }, (_, k) => bar(18 + k, { h: 101.2, l: 101.0, c: 101.1 })),
];

const location = ({ bars, dailyBars = [], dailyPlan = null, asOf, bias }) =>
  levelLocation({ levels: levelMap({ bars, dailyBars, dailyPlan, asOf }), bars, asOf, bias });

describe('levelLocation', () => {
  const priorHigh101 = [daily('2026-10-26', 101, 98)];

  it('is met for an entry near a tier 1 level broken with acceptance its way', () => {
    expect(location({ bars: BREAK_UP, dailyBars: priorHigh101, asOf: at('09:53'), bias: 'long' })).toEqual({
      status: 'met',
      level: { kind: 'prior_day_high', price: 101, tier: 1 },
      event: 'accepted',
      at: at('09:47').toISOString(),
    });
  });

  it('is floating for an entry against the latest event at the level', () => {
    expect(location({ bars: BREAK_UP, dailyBars: priorHigh101, asOf: at('09:53'), bias: 'short' })).toMatchObject({
      status: 'missed',
      level: null,
      event: null,
    });
  });

  it('does not count a break before its acceptance has closed', () => {
    // At 9:47 only the 9:45 break and the 9:46 hold, back near 101, have closed.
    // The break bar crossed 101 from below, so it is no sweep either.
    const early = [...BREAK_UP.slice(0, 16), bar(16, { h: 101.2, l: 101.0, c: 101.1 })];
    expect(location({ bars: early, dailyBars: priorHigh101, asOf: at('09:47'), bias: 'long' }).status).toBe('missed');
  });

  it('is floating near a level price has not broken or swept', () => {
    const below = [...QUIET, ...Array.from({ length: 5 }, (_, k) => bar(15 + k, { h: 100.85, l: 100.6, c: 100.8 }))];
    const result = location({ bars: below, dailyBars: [daily('2026-10-26', 100.95, 98)], asOf: at('09:50'), bias: 'short' });
    expect(result).toMatchObject({ status: 'missed', level: null });
  });

  it('is met after a sweep and rejection of the level', () => {
    // 9:45 trades under the prior day's low of 100.3 and closes back above it.
    const swept = [
      ...QUIET.map((b) => ({ ...b, h: 100.9, l: 100.5, c: 100.7 })),
      bar(15, { h: 100.6, l: 100.1, c: 100.45, v: 200 }),
      ...Array.from({ length: 3 }, (_, k) => bar(16 + k, { h: 100.6, l: 100.35, c: 100.45 })),
    ];
    expect(location({ bars: swept, dailyBars: [daily('2026-10-26', 103, 100.3)], asOf: at('09:49'), bias: 'long' })).toEqual({
      status: 'met',
      level: { kind: 'prior_day_low', price: 100.3, tier: 1 },
      event: 'swept',
      at: at('09:45').toISOString(),
    });
  });

  it('never counts a tier 3 level', () => {
    const fib = { ltfDirection: 'bullish', ltfFib50: 101, ltfFib100: 103 };
    expect(location({ bars: BREAK_UP, dailyPlan: fib, asOf: at('09:53'), bias: 'long' })).toMatchObject({ status: 'missed' });
  });

  it('needs rising volume on the break bar for a tier 2 level', () => {
    // The opening range high (100.7, tier 2) breaks at 9:45, and price comes
    // back to 100.8 by 9:52.
    const retest = (volume) => [
      ...QUIET,
      bar(15, { h: 101.1, l: 100.6, c: 101.0, v: volume }),
      bar(16, { h: 101.2, l: 100.9, c: 101.1 }),
      bar(17, { h: 101.1, l: 100.9, c: 101.0 }),
      ...Array.from({ length: 5 }, (_, k) => bar(18 + k, { h: 100.95, l: 100.75, c: 100.8 })),
    ];
    expect(location({ bars: retest(200), asOf: at('09:53'), bias: 'long' })).toMatchObject({
      status: 'met',
      level: { kind: 'opening_range_high', tier: 2 },
    });
    expect(location({ bars: retest(100), asOf: at('09:53'), bias: 'long' }).status).toBe('missed');
  });

  // A tier 1 level at 101 with no volume rule, built by hand.
  const at101 = (formedAt = null) => ({ kind: 'prior_day_high', price: 101, tier: 1, touchedToday: true, formedAt });

  it('ignores events before the level formed', () => {
    const asOf = at('09:53');
    expect(levelLocation({ levels: [at101()], bars: BREAK_UP, asOf, bias: 'long' }).status).toBe('met');
    expect(levelLocation({ levels: [at101(at('09:48').toISOString())], bars: BREAK_UP, asOf, bias: 'long' }).status).toBe(
      'missed'
    );
  });

  it('takes back an acceptance when a close comes back inside within N_RECLAIM bars', () => {
    // 9:45 breaks, 9:46 and 9:47 hold, and 9:48, the third bar after the
    // break, closes back on 101. Price then sits on the level.
    const reclaimed = [
      ...BREAK_UP.slice(0, 18),
      bar(18, { h: 101.3, l: 101.0, c: 101.0 }),
      ...Array.from({ length: 4 }, (_, k) => bar(19 + k, { h: 101.0, l: 101.0, c: 101.0 })),
    ];
    expect(levelLocation({ levels: [at101()], bars: reclaimed, asOf: at('09:53'), bias: 'long' }).status).toBe('missed');
  });

  it('lets a later event at the level replace an earlier one', () => {
    // Accepted above at 9:47, then broken back below at 9:48 and held there.
    const reversed = [
      ...BREAK_UP.slice(0, 18),
      ...Array.from({ length: 5 }, (_, k) => bar(18 + k, { h: 101.0, l: 100.8, c: 100.9 })),
    ];
    const asOf = at('09:53');
    expect(levelLocation({ levels: [at101()], bars: reversed, asOf, bias: 'long' }).status).toBe('missed');
    expect(levelLocation({ levels: [at101()], bars: reversed, asOf, bias: 'short' })).toMatchObject({
      status: 'met',
      event: 'accepted',
      at: at('09:50').toISOString(),
    });
  });

  it("locates an entry at a four-touch line broken on its 4th approach's first bar", () => {
    // The four-touch example without bar 7, so the break bar (on rising
    // volume) starts the 4th approach, then a pullback to the line.
    const MINUTE = 60_000;
    const open = Date.parse(`${DAY}T13:30:00Z`);
    const specs = [...breakout.slice(0, W + 7), ...breakout.slice(W + 8)];
    const timed = specs.map((b, k) => ({ ...b, v: k === W + 7 ? 200 : 100, t: new Date(open + k * MINUTE).toISOString() }));
    const n = timed.length;
    const retest = [
      { o: 281, h: 296, l: 281, c: 295.5, v: 100 },
      { o: 295.5, h: 300.4, l: 295, c: 299.9, v: 100 },
    ].map((b, k) => ({ ...b, t: new Date(open + (n + k) * MINUTE).toISOString() }));
    const bars = [...timed, ...retest];
    const asOf = new Date(open + bars.length * MINUTE);
    const levels = levelMap({ bars, asOf });

    expect(levels.map((level) => level.kind)).toContain('four_touch_1m');
    expect(levelLocation({ levels, bars, asOf, bias: 'short' })).toMatchObject({
      status: 'met',
      level: { kind: 'four_touch_1m' },
      event: 'accepted',
    });
  });

  it("does the same for a 5m line, whose break closes on a minute inside that first bar", () => {
    const MINUTE = 60_000;
    const open = Date.parse(`${DAY}T13:30:00Z`);
    // Each 5m spec as five minute bars, closing on the last; the break bar's
    // last minute, which closes through the line, comes on rising volume.
    const fiveMinute = (start, { o, h, l, c }, lastVolume = 100) =>
      [
        { o, h: o, l: o, c: o },
        { o, h, l: o, c: o },
        { o, h: o, l, c: o },
        { o, h: o, l: o, c: o },
        { o, h: Math.max(o, c), l: Math.min(o, c), c },
      ].map((b, k) => ({ ...b, v: k === 4 ? lastVolume : 100, t: new Date(start + k * MINUTE).toISOString() }));
    const specs = [
      ...breakout.slice(0, W + 7),
      ...breakout.slice(W + 8),
      { o: 281, h: 296, l: 281, c: 295.5 },
      { o: 295.5, h: 300.4, l: 295, c: 299.9 },
    ];
    const bars = specs.flatMap((spec, k) => fiveMinute(open + k * 5 * MINUTE, spec, k === W + 7 ? 200 : 100));
    const asOf = new Date(open + specs.length * 5 * MINUTE);
    const lines = levelMap({ bars, asOf }).filter((level) => level.kind === 'four_touch_5m');

    expect(lines).toHaveLength(1);
    expect(levelLocation({ levels: lines, bars, asOf, bias: 'short' })).toMatchObject({ status: 'met', event: 'accepted' });
  });

  it('follows a sloped line bar by bar', () => {
    // A tier 2 line at 101 on the last bar (9:52). Flat, the 9:45 bar breaks
    // it on rising volume. Rising 0.1 a minute bar, it sat under every quiet
    // close, so nothing broke it and the entry floats.
    const line = (slope) => ({ kind: 'four_touch_1m', price: 101, tier: 2, slope, touchedToday: true, formedAt: null });
    const asOf = at('09:53');
    expect(levelLocation({ levels: [line(0)], bars: BREAK_UP, asOf, bias: 'long' }).status).toBe('met');
    expect(levelLocation({ levels: [line(0.1)], bars: BREAK_UP, asOf, bias: 'long' }).status).toBe('missed');
  });

  it('is unknown without a direction or a closed bar of the day', () => {
    expect(location({ bars: BREAK_UP, dailyBars: priorHigh101, asOf: at('09:53'), bias: null }).status).toBe('unknown');
    expect(location({ bars: BREAK_UP, dailyBars: priorHigh101, asOf: at('09:30'), bias: 'long' }).status).toBe('unknown');
  });
});
