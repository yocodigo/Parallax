import { describe, expect, it } from 'vitest';
import { levelMap } from '../levels';

// Tuesday 2026-10-27, on Eastern Daylight Time.
const DAY = '2026-10-27';
const at = (nyTime, date = DAY) => new Date(`${date}T${nyTime}:00-04:00`);

// A minute bar starting at `nyTime`, closing mid-range unless told otherwise.
const bar = (nyTime, { h, l, c = (h + l) / 2, v = 100 }) => ({ t: at(nyTime).toISOString(), o: c, h, l, c, v });

// Alpaca's daily bars carry the New York midnight of their day.
const daily = (date, h, l) => ({ t: `${date}T04:00:00Z`, o: l, h, l, c: h, v: 1000 });

const clock = (minutes) => {
  const total = 9 * 60 + 30 + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

// 9:30 to 9:59. The opening range (9:30-9:44) peaks at 681 at 9:35 and
// bottoms at 679 at 9:40; the session's high so far is 682, at 9:50. The last
// close is 680.3.
const SESSION = Array.from({ length: 30 }, (_, k) => {
  if (k === 5) return bar(clock(k), { h: 681, l: 679.5 });
  if (k === 10) return bar(clock(k), { h: 680.5, l: 679 });
  if (k === 20) return bar(clock(k), { h: 682, l: 680, c: 681 });
  if (k < 15) return bar(clock(k), { h: 680.5, l: 679.5 });
  return bar(clock(k), { h: 680.6, l: 680, c: 680.3 });
});

const DAILY = [
  daily('2026-10-16', 700, 690), // two weeks back: no level
  daily('2026-10-19', 685, 677),
  daily('2026-10-20', 684, 676.2),
  daily('2026-10-21', 686.5, 678),
  daily('2026-10-22', 684, 679),
  daily('2026-10-23', 683, 680),
  // This week's Monday, above the prior week's high: the prior week must stop
  // at the Sunday before it.
  daily('2026-10-26', 687, 678.4),
  daily(DAY, 690, 670), // the day itself, not over yet
];

const find = (levels, kind) => levels.find((level) => level.kind === kind);
const kinds = (levels) => levels.map((level) => level.kind);

describe('levelMap', () => {
  const levels = levelMap({ bars: SESSION, dailyBars: DAILY, asOf: at('10:00') });

  it("takes the prior day's high and low from the last daily bar before the day, never the day's own", () => {
    expect(find(levels, 'prior_day_high')).toMatchObject({ price: 687, tier: 1, side: 'resistance', touchedToday: false });
    expect(find(levels, 'prior_day_low')).toMatchObject({ price: 678.4, tier: 1, side: 'support', touchedToday: false });
  });

  it("takes the prior week's high and low from the calendar week before the day's", () => {
    expect(find(levels, 'prior_week_high')).toMatchObject({ price: 686.5, tier: 1 });
    expect(find(levels, 'prior_week_low')).toMatchObject({ price: 676.2, tier: 1 });
  });

  it("on a Monday, takes the prior day from Friday, inside the prior week, and leaves out the Monday's own bar", () => {
    const monday = SESSION.map((b) => ({ ...b, t: new Date(Date.parse(b.t) - 24 * 60 * 60 * 1000).toISOString() }));
    const mondayLevels = levelMap({ bars: monday, dailyBars: DAILY, asOf: at('10:00', '2026-10-26') });

    expect(find(mondayLevels, 'prior_day_high').price).toBe(683);
    expect(find(mondayLevels, 'prior_week_high').price).toBe(686.5);
    expect(find(mondayLevels, 'prior_week_low').price).toBe(676.2);
  });

  it('leaves bars outside the regular session out of every level', () => {
    const premarket = bar('09:20', { h: 690, l: 670 });
    const withPremarket = levelMap({ bars: [premarket, ...SESSION], dailyBars: DAILY, asOf: at('10:00') });

    expect(find(withPremarket, 'opening_range_high').price).toBe(681);
    expect(find(withPremarket, 'session_low').price).toBe(679);
    expect(find(withPremarket, 'prior_day_low').touchedToday).toBe(false);
  });

  it('gives the session high and low from the bars closed so far, as tier 2', () => {
    expect(find(levels, 'session_high')).toMatchObject({
      price: 682,
      tier: 2,
      touchedToday: false,
      formedAt: at('09:51').toISOString(),
    });
    expect(find(levels, 'prior_day_high').formedAt).toBeNull();
    expect(find(levels, 'session_low')).toMatchObject({ price: 679, tier: 2, touchedToday: false });
    const early = levelMap({ bars: SESSION, dailyBars: DAILY, asOf: at('09:50') });
    expect(find(early, 'session_high').price).toBe(681);
  });

  it('gives the opening range once its 15 minutes have closed, touched only by a bar after it', () => {
    expect(find(levels, 'opening_range_high')).toMatchObject({ price: 681, tier: 2, touchedToday: true });
    expect(find(levels, 'opening_range_low')).toMatchObject({ price: 679, tier: 2, touchedToday: false });
    const inside = levelMap({ bars: SESSION, dailyBars: DAILY, asOf: at('09:44') });
    expect(kinds(inside)).not.toContain('opening_range_high');
  });

  it("adds the plan's overnight levels as tier 1, leaving out the blank ones", () => {
    const dailyPlan = { asiaHigh: 684.1, asiaLow: 677.9, londonHigh: 681.6, londonLow: null, premarketHigh: null, premarketLow: 679.8 };
    const withPlan = levelMap({ bars: SESSION, dailyBars: DAILY, dailyPlan, asOf: at('10:00') });

    expect(find(withPlan, 'asia_high')).toMatchObject({ price: 684.1, tier: 1, touchedToday: false });
    expect(find(withPlan, 'asia_low')).toMatchObject({ price: 677.9, tier: 1 });
    expect(find(withPlan, 'london_high')).toMatchObject({ price: 681.6, touchedToday: true });
    expect(find(withPlan, 'premarket_low')).toMatchObject({ price: 679.8, touchedToday: true });
    expect(kinds(withPlan)).not.toContain('london_low');
    expect(kinds(withPlan)).not.toContain('premarket_high');
  });

  it("adds the day's fibs as tier 3 targets", () => {
    const dailyPlan = { ltfFib50: 682.5, ltfFib100: 684, htfFib50: 676, htfFib100: 672 };
    const withPlan = levelMap({ bars: SESSION, dailyBars: DAILY, dailyPlan, asOf: at('10:00') });

    expect(find(withPlan, 'fib_50')).toMatchObject({ price: 682.5, tier: 3, side: 'resistance' });
    expect(find(withPlan, 'fib_100')).toMatchObject({ price: 684, tier: 3 });
    expect(find(withPlan, 'htf_fib_50')).toMatchObject({ price: 676, tier: 3, side: 'support' });
    expect(find(withPlan, 'htf_fib_100')).toMatchObject({ price: 672, tier: 3 });
  });

  it('gives the round numbers either side of the price as tier 3', () => {
    const rounds = levels.filter((level) => level.kind === 'round');
    expect(rounds).toEqual([
      expect.objectContaining({ price: 680, tier: 3, side: 'support', touchedToday: true }),
      expect.objectContaining({ price: 685, tier: 3, side: 'resistance', touchedToday: false }),
    ]);
  });

  it("gives the 5m dealing range's 50% once both swings are confirmed, touched only after that", () => {
    expect(kinds(levels)).not.toContain('range_50');
    // The 9:55 and 10:00 5m bars confirm 9:50's high as a swing; 9:40's low
    // already is one. The bars that drew the range cross its 50% (680.5);
    // the ones after it stay under.
    const later = [...SESSION, ...Array.from({ length: 5 }, (_, k) => bar(clock(30 + k), { h: 680.4, l: 680.1 }))];
    const range = levelMap({ bars: later, dailyBars: DAILY, asOf: at('10:05') });
    expect(find(range, 'range_50')).toMatchObject({
      price: 680.5,
      tier: 3,
      touchedToday: false,
      formedAt: at('10:05').toISOString(),
    });
  });

  it('never reads a bar that had not closed by asOf', () => {
    // The 9:50 bar holds the session high; at 9:50:30 it is still forming.
    const forming = levelMap({ bars: SESSION, dailyBars: DAILY, asOf: new Date(at('09:50').getTime() + 30_000) });
    expect(find(forming, 'session_high').price).toBe(681);
  });

  it('touchedToday ignores bars after asOf', () => {
    const touch = bar(clock(31), { h: 687.5, l: 687 });
    const before = levelMap({ bars: [...SESSION, touch], dailyBars: DAILY, asOf: at('10:00') });
    const after = levelMap({ bars: [...SESSION, touch], dailyBars: DAILY, asOf: at('10:05') });
    expect(find(before, 'prior_day_high').touchedToday).toBe(false);
    expect(find(after, 'prior_day_high').touchedToday).toBe(true);
  });

  it('lists the levels by price, low to high', () => {
    const prices = levels.map((level) => level.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('has no levels before a bar of the day has closed', () => {
    expect(levelMap({ bars: SESSION, dailyBars: DAILY, asOf: at('09:30') })).toEqual([]);
  });
});
