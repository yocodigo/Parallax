import { describe, expect, it } from 'vitest';
import { adherence, disciplineByMonth, emotionalControlByMonth, violationCosts } from '../adherence';

// A closed long option with the given contracts, net P/L, and entry time.
function option(net, { quantity = 1, openedAt = '2026-04-13T14:00:00Z' } = {}) {
  return {
    assetClass: 'option',
    direction: 'long',
    quantity,
    multiplier: 100,
    entryPrice: 1,
    exitPrice: 1 + net / (100 * quantity),
    fees: 0,
    openedAt: new Date(openedAt),
    closedAt: new Date('2026-04-13T20:00:00Z'),
  };
}

// Entry windows are New York clock times (settings.js): 16:00Z is 12:00 there,
// inside the 11:00-14:00 window; 14:00Z is 10:00, outside every window.
// Windows aren't scored (rules-v3 section 5), so neither time changes a score.
const LOCKED = '2026-04-13T16:00:00Z';
const FREE = '2026-04-13T14:00:00Z';

describe('adherence', () => {
  it('counts trades that held the size rule and what the violations cost, leaving the window unscored', () => {
    const result = adherence([
      option(50, { openedAt: FREE }),
      option(-30, { openedAt: LOCKED }),
      option(-20, { openedAt: FREE, quantity: 3 }),
      option(10, { openedAt: LOCKED, quantity: 3 }),
    ]);

    expect(result.trades).toBe(4);
    expect(result.window).toEqual({ ok: 0, missed: 0, cost: 0 });
    expect(result.size).toEqual({ ok: 2, missed: 2, cost: -10 });
  });

  it('leaves out trades that were never closed', () => {
    const open = { ...option(10), closedAt: null, exitPrice: null };
    expect(adherence([open]).trades).toBe(0);
  });

  it('leaves out stock trades, whose share counts are not contracts', () => {
    const stock = { ...option(10), assetClass: 'stock', quantity: 100, multiplier: 1 };
    expect(adherence([stock]).trades).toBe(0);
  });

  it('leaves out a closed trade with no exit price', () => {
    expect(adherence([{ ...option(10), exitPrice: null }]).trades).toBe(0);
  });

  it('counts a closed trade with no entry time toward neither side of the window rule', () => {
    const result = adherence([{ ...option(-10), openedAt: null }]);
    expect(result.trades).toBe(1);
    expect(result.window).toEqual({ ok: 0, missed: 0, cost: 0 });
  });

  it('sums costs in cents', () => {
    const result = adherence([
      option(-0.1, { quantity: 3, openedAt: FREE }),
      option(-0.2, { quantity: 3, openedAt: FREE }),
    ]);
    expect(result.size.cost).toBe(-0.3);
  });

  it('returns zeros for no trades', () => {
    expect(adherence([])).toEqual({
      trades: 0,
      window: { ok: 0, missed: 0, cost: 0 },
      size: { ok: 0, missed: 0, cost: 0 },
      plan: { ok: 0, missed: 0, cost: 0 },
      stop: { ok: 0, missed: 0, cost: 0 },
      exit: { ok: 0, missed: 0, cost: 0 },
      discipline: { ok: 0, missed: 0, cost: null },
    });
  });
});

describe('violationCosts', () => {
  it('splits net P/L by which rules the entry broke, each trade in one bucket, a window entry breaking nothing', () => {
    const result = violationCosts([
      option(50, { openedAt: FREE }),
      option(-30, { openedAt: LOCKED }),
      option(-20, { openedAt: FREE, quantity: 3 }),
      option(-15, { openedAt: LOCKED, quantity: 3 }),
      option(10, { openedAt: FREE }),
    ]);

    expect(result).toEqual({
      followed: { trades: 3, net: 30 },
      window: { trades: 0, net: 0 },
      size: { trades: 2, net: -35 },
      both: { trades: 0, net: 0 },
    });
  });

  it('counts a trade the window gate cannot judge as followed unless size was broken', () => {
    const result = violationCosts([{ ...option(-10), openedAt: null }]);
    expect(result.followed).toEqual({ trades: 1, net: -10 });
  });

  it('leaves out stocks and trades with no P/L, and sums in cents', () => {
    const stock = { ...option(10), assetClass: 'stock', quantity: 100, multiplier: 1 };
    const open = { ...option(10), closedAt: null, exitPrice: null };
    const result = violationCosts([
      stock,
      open,
      option(-0.1, { openedAt: FREE }),
      option(-0.2, { openedAt: FREE }),
    ]);
    expect(result.followed).toEqual({ trades: 2, net: -0.3 });
  });

  it('returns zeros for no trades', () => {
    const zero = { trades: 0, net: 0 };
    expect(violationCosts([])).toEqual({ followed: zero, window: zero, size: zero, both: zero });
  });
});

describe('adherence: Plan OK', () => {
  // A plan written before the fill, with a strategy picked and no unmet rule.
  const planned = (net, extra = {}) => ({
    ...option(net),
    strategyId: 'strategy-1',
    planWrittenAt: new Date('2026-04-13T13:00:00Z'),
    unmetRuleCount: 0,
    ...extra,
  });

  it('is met with a plan written before the fill, a strategy, and every checklist rule met', () => {
    expect(adherence([planned(20)]).plan).toEqual({ ok: 1, missed: 0, cost: 0 });
  });

  it('is missed with no plan entry, a plan written after the fill, or no strategy, and costs the net P/L', () => {
    const result = adherence([
      planned(-10, { planWrittenAt: null }),
      planned(-20, { planWrittenAt: new Date('2026-04-13T15:00:00Z') }),
      planned(-30, { strategyId: null }),
      planned(40),
    ]);

    expect(result.plan).toEqual({ ok: 1, missed: 3, cost: -60 });
  });

  it('is missed when a checklist rule was unmet and the entry went ahead anyway', () => {
    expect(adherence([planned(-15, { unmetRuleCount: 2 })]).plan).toEqual({ ok: 0, missed: 1, cost: -15 });
  });

  it('counts a trade with no entry time toward neither side', () => {
    expect(adherence([planned(-15, { openedAt: null })]).plan).toEqual({ ok: 0, missed: 0, cost: 0 });
  });
});

describe('adherence: Stop OK', () => {
  // A long option bought at 1 with its stop at 0.8; exitPrice sets where it was sold.
  const stopped = (exitPrice, extra = {}) => ({
    ...option(0),
    initialStop: 0.8,
    exitPrice,
    ...extra,
  });

  it('is met when the exit was no worse than the stop, and missed when it was, at the net P/L', () => {
    const result = adherence([stopped(0.8), stopped(1.5), stopped(0.7)]);

    expect(result.stop).toEqual({ ok: 2, missed: 1, cost: -30 });
  });

  it('judges a short by the other side of the stop', () => {
    const short = (exitPrice) => stopped(exitPrice, { direction: 'short', entryPrice: 1, initialStop: 1.2 });

    expect(adherence([short(1.2), short(1.3)]).stop).toEqual({ ok: 1, missed: 1, cost: -30 });
  });

  it('counts a trade with no stop toward neither side, since option stops are optional', () => {
    expect(adherence([option(-40)]).stop).toEqual({ ok: 0, missed: 0, cost: 0 });
  });
});

describe('adherence: Exit OK', () => {
  const exited = (net, exitReason) => ({ ...option(net), exitReason });

  it('is met for a planned exit and missed for a discomfort exit, at the net P/L', () => {
    const result = adherence([
      exited(40, 'target'),
      exited(-10, 'invalidation'),
      exited(-25, 'felt_heavy'),
      exited(15, 'sweep_scare'),
    ]);

    expect(result.exit).toEqual({ ok: 2, missed: 2, cost: -10 });
  });

  it('counts a trade with no recorded reason toward neither side', () => {
    expect(adherence([exited(-5, null)]).exit).toEqual({ ok: 0, missed: 0, cost: 0 });
  });
});

describe('adherence: discipline score', () => {
  // Plan OK met, Stop OK met, Exit OK missed.
  const trade = (extra = {}) => ({
    ...option(10),
    strategyId: 'strategy-1',
    planWrittenAt: new Date('2026-04-13T13:00:00Z'),
    unmetRuleCount: 0,
    initialStop: 0.5,
    exitReason: 'felt_heavy',
    ...extra,
  });

  it('pools the Plan OK, Stop OK, and Exit OK checks that were passed and failed', () => {
    const result = adherence([trade(), trade({ strategyId: null, exitReason: 'target' })]);

    // First trade: plan met, stop met, exit missed. Second: plan missed, stop met, exit met.
    expect(result.discipline).toEqual({ ok: 4, missed: 2, cost: null });
  });

  it('counts only the checks that apply: a trade with no stop or reason adds just its plan check', () => {
    const result = adherence([trade({ initialStop: null, exitReason: null })]);

    expect(result.discipline).toEqual({ ok: 1, missed: 0, cost: null });
  });

  it('leaves out the window and size rules', () => {
    const result = adherence([trade({ openedAt: new Date(LOCKED), quantity: 3, strategyId: null, initialStop: null, exitReason: null })]);

    expect(result.window).toEqual({ ok: 0, missed: 0, cost: 0 });
    expect(result.size.missed).toBe(1);
    expect(result.discipline).toEqual({ ok: 0, missed: 1, cost: null });
  });
});

describe('disciplineByMonth', () => {
  // Plan OK met, Stop OK met, Exit OK met: three checks passed.
  const clean = (closedAt) => ({
    ...option(10),
    strategyId: 'strategy-1',
    planWrittenAt: new Date('2026-04-13T13:00:00Z'),
    unmetRuleCount: 0,
    initialStop: 0.5,
    exitReason: 'target',
    closedAt: new Date(closedAt),
  });
  const sloppy = (closedAt) => ({ ...clean(closedAt), strategyId: null, exitReason: 'felt_heavy' });

  it('scores each New York month of closing: the checks passed over the ones that applied', () => {
    const rows = disciplineByMonth([
      clean('2026-03-10T20:00:00Z'),
      sloppy('2026-04-13T20:00:00Z'), // plan missed, stop met, exit missed
      clean('2026-04-14T20:00:00Z'),
    ]);

    expect(rows).toEqual([
      { month: '2026-03', ok: 3, missed: 0, score: 1 },
      { month: '2026-04', ok: 4, missed: 2, score: 4 / 6 },
    ]);
  });

  it('files a trade under the New York month it closed in, not the UTC one', () => {
    // 02:00Z on May 1 is still the evening of April 30 in New York.
    const rows = disciplineByMonth([clean('2026-05-01T02:00:00Z')]);
    expect(rows.map((r) => r.month)).toEqual(['2026-04']);
  });

  it('gives a month where no check applied a null score, not zero', () => {
    const bare = { ...clean('2026-04-13T20:00:00Z'), openedAt: null, initialStop: null, exitReason: null };
    expect(disciplineByMonth([bare])).toEqual([{ month: '2026-04', ok: 0, missed: 0, score: null }]);
  });

  it('leaves out trades that are not options, and has no rows without trades', () => {
    expect(disciplineByMonth([{ ...clean('2026-04-13T20:00:00Z'), assetClass: 'stock' }])).toEqual([]);
    expect(disciplineByMonth([])).toEqual([]);
  });
});

describe('emotionalControlByMonth', () => {
  const closedOn = (closedAt, emotionalControls) => ({
    assetClass: 'option',
    closedAt: new Date(closedAt),
    emotionalControls,
  });

  it('averages the ratings of the reviews of trades closed in each New York month', () => {
    const rows = emotionalControlByMonth([
      closedOn('2026-03-10T20:00:00Z', [8]),
      closedOn('2026-04-13T20:00:00Z', [4, 6]),
      closedOn('2026-04-14T20:00:00Z', [9]),
    ]);

    expect(rows).toEqual([
      { month: '2026-03', average: 8, reviews: 1 },
      { month: '2026-04', average: 19 / 3, reviews: 3 },
    ]);
  });

  it('counts every asset class, files by New York month, and skips trades with no rating', () => {
    const rows = emotionalControlByMonth([
      { ...closedOn('2026-05-01T02:00:00Z', [5]), assetClass: 'stock' }, // evening of April 30 in New York
      closedOn('2026-06-02T20:00:00Z', []),
    ]);

    expect(rows).toEqual([{ month: '2026-04', average: 5, reviews: 1 }]);
    expect(emotionalControlByMonth([])).toEqual([]);
  });
});
