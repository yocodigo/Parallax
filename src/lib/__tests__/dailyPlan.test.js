import { describe, expect, it } from 'vitest';
import { parseDailyPlan } from '../dailyPlan';

// The working fib for the day: bullish, 50% at 681.2, 100% at 684.5.
const onePlan = {
  tradeDate: '2026-10-28',
  ltfDirection: 'bullish',
  ltfFib50: 681.2,
  ltfFib100: 684.5,
};

// A second, higher-timeframe fib, whose 50% is the target after a pivot.
const twoPlan = {
  ...onePlan,
  htfDirection: 'bullish',
  htfFib50: 686,
  htfFib100: 691.4,
};

// Field paths of every validation error, e.g. ['ltfFib100'].
const errorPaths = (result) => result.error.issues.map((issue) => issue.path.join('.'));

describe('parseDailyPlan', () => {
  it('accepts a plan with one fib', () => {
    const result = parseDailyPlan(onePlan);

    expect(result.success).toBe(true);
    expect(result.data.htfDirection).toBeUndefined();
  });

  it('accepts a plan with both fibs and notes', () => {
    const result = parseDailyPlan({ ...twoPlan, notes: 'gap up into the HTF 50%' });

    expect(result.success).toBe(true);
    expect(result.data.htfFib50).toBe(686);
  });

  it('accepts a bearish fib falling from its 50% to its 100%', () => {
    const result = parseDailyPlan({ ...onePlan, ltfDirection: 'bearish', ltfFib50: 681.2, ltfFib100: 677.5 });

    expect(result.success).toBe(true);
  });

  it('needs a trade date as a plain date string', () => {
    expect(errorPaths(parseDailyPlan({ ...onePlan, tradeDate: undefined }))).toContain('tradeDate');
    expect(errorPaths(parseDailyPlan({ ...onePlan, tradeDate: '2026-10-28T13:30:00Z' }))).toContain('tradeDate');
  });

  it('needs the whole working fib', () => {
    const result = parseDailyPlan({ tradeDate: '2026-10-28' });

    expect(errorPaths(result)).toEqual(
      expect.arrayContaining(['ltfDirection', 'ltfFib50', 'ltfFib100'])
    );
  });

  it('needs the whole second fib once any of it is given', () => {
    const result = parseDailyPlan({ ...onePlan, htfFib50: 686 });

    expect(errorPaths(result)).toEqual(expect.arrayContaining(['htfDirection', 'htfFib100']));
  });

  it('rejects a 100% level that is not past the 50% in the fib direction', () => {
    expect(errorPaths(parseDailyPlan({ ...onePlan, ltfFib100: 680 }))).toContain('ltfFib100');
    expect(
      errorPaths(parseDailyPlan({ ...twoPlan, htfDirection: 'bearish', htfFib100: 691.4 }))
    ).toContain('htfFib100');
  });

  it('rejects levels that are not positive prices', () => {
    expect(errorPaths(parseDailyPlan({ ...onePlan, ltfFib50: 0 }))).toContain('ltfFib50');
  });
});
