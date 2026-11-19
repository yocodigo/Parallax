import { describe, expect, it } from 'vitest';
import { levelReactions } from '../levelReactions';

const clock = (k) => {
  const total = 9 * 60 + 30 + k;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
// A session's bars, the first at 9:30 New York time on `date` (Eastern Daylight Time).
const session = (date, shapes) =>
  shapes.map(([o, h, l, c], k) => ({ t: new Date(`${date}T${clock(k)}:00-04:00`).toISOString(), o, h, l, c, v: 100 }));
const daily = (date, h, l) => ({ t: `${date}T04:00:00Z`, o: l, h, l, c: h, v: 1000 });

// Twenty quiet bars of range 1 around 98, so the ATR is about 1.
const quiet = Array.from({ length: 20 }, (_, k) => (k % 2 ? [98.2, 98.7, 97.7, 98] : [98, 98.5, 97.5, 98.2]));
const YESTERDAY = '2026-10-26';
const TODAY = '2026-10-27';
// The day's bars: quiet, then a bar that reaches 100 from below and one that closes back.
const REJECTED = [...quiet, [98.1, 100, 98, 99.8], [99.8, 99.9, 99.2, 99.3]];
const DAILY = [daily(YESTERDAY, 100, 97)];

const find = (result, kind) => result.kinds.find((row) => row.kind === kind);

describe('levelReactions', () => {
  it("judges each level known at the open from the first touch on, the side from the day's open", () => {
    const result = levelReactions({
      bars: [...session(YESTERDAY, quiet), ...session(TODAY, REJECTED)],
      dailyBars: DAILY,
      plans: [],
    });

    expect(result.sessions).toBe(1);
    expect(find(result, 'prior_day_high')).toEqual({
      kind: 'prior_day_high',
      sessions: 1,
      reached: 1,
      rejected: 1,
      ranThrough: 0,
      oscillating: 0,
      none: 0,
      undecided: 0,
    });
    // 97 is below the open, so price must come down to it, and never did.
    expect(find(result, 'prior_day_low')).toMatchObject({ sessions: 1, reached: 0, rejected: 0 });
  });

  it('counts a touch the close of the session leaves open as undecided', () => {
    const result = levelReactions({
      bars: [...session(YESTERDAY, quiet), ...session(TODAY, [...quiet, [98.1, 100, 98, 99.8]])],
      dailyBars: DAILY,
      plans: [],
    });

    expect(find(result, 'prior_day_high')).toMatchObject({ reached: 1, undecided: 1 });
  });

  it("adds the plan's levels on the days of that plan only", () => {
    const plans = [{ tradeDate: TODAY, premarketHigh: 100, ltfFib50: 150 }];
    const result = levelReactions({
      bars: [...session(YESTERDAY, quiet), ...session(TODAY, REJECTED)],
      dailyBars: DAILY,
      plans,
    });

    expect(find(result, 'premarket_high')).toMatchObject({ sessions: 1, reached: 1, rejected: 1 });
    expect(find(result, 'fib_50')).toMatchObject({ sessions: 1, reached: 0 });
    expect(find(result, 'asia_high')).toBeUndefined();
  });

  it('skips the first session of the bars, which has no session before it for the ATR', () => {
    const result = levelReactions({ bars: session(TODAY, REJECTED), dailyBars: DAILY, plans: [] });

    expect(result.sessions).toBe(0);
    expect(result.kinds).toEqual([]);
  });

  it('leaves out a level exactly at the open, which has no side to approach from', () => {
    const result = levelReactions({
      bars: [...session(YESTERDAY, quiet), ...session(TODAY, REJECTED)],
      dailyBars: [daily(YESTERDAY, 98, 97)],
      plans: [],
    });

    expect(find(result, 'prior_day_high')).toBeUndefined();
  });

  it('judges only the sessions from `from` on, the ones before it feeding the ATR', () => {
    const bars = [...session(YESTERDAY, quiet), ...session(TODAY, REJECTED)];

    expect(levelReactions({ bars, dailyBars: DAILY, plans: [], from: TODAY }).sessions).toBe(1);
    const later = levelReactions({ bars, dailyBars: DAILY, plans: [], from: '2026-10-28' });
    expect(later).toEqual({ sessions: 0, kinds: [] });
  });

  it('ignores minutes outside the regular session', () => {
    const premarket = { t: new Date(`${TODAY}T08:00:00-04:00`).toISOString(), o: 90, h: 120, l: 90, c: 100, v: 1 };
    const result = levelReactions({
      bars: [...session(YESTERDAY, quiet), premarket, ...session(TODAY, REJECTED)],
      dailyBars: DAILY,
      plans: [],
    });

    expect(find(result, 'prior_day_high')).toMatchObject({ reached: 1, rejected: 1 });
  });

  it('orders the kinds as the level map does', () => {
    const plans = [{ tradeDate: TODAY, premarketHigh: 100, asiaLow: 96 }];
    const result = levelReactions({
      bars: [...session(YESTERDAY, quiet), ...session(TODAY, REJECTED)],
      dailyBars: DAILY,
      plans,
    });

    expect(result.kinds.map((row) => row.kind)).toEqual(['prior_day_high', 'prior_day_low', 'asia_low', 'premarket_high']);
  });
});
