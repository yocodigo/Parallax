import { describe, expect, it } from 'vitest';
import { adherence, violationCosts } from '../adherence';

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

// Lockouts are New York clock times (settings.js): 16:00Z is 12:00 there,
// inside the 11:00-14:00 window; 14:00Z is 10:00, outside every window.
const LOCKED = '2026-04-13T16:00:00Z';
const FREE = '2026-04-13T14:00:00Z';

describe('adherence', () => {
  it('counts trades that held the window and size rules, and what the violations cost', () => {
    const result = adherence([
      option(50, { openedAt: FREE }),
      option(-30, { openedAt: LOCKED }),
      option(-20, { openedAt: FREE, quantity: 3 }),
      option(10, { openedAt: LOCKED, quantity: 3 }),
    ]);

    expect(result.trades).toBe(4);
    expect(result.window).toEqual({ ok: 2, missed: 2, cost: -20 });
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
    });
  });
});

describe('violationCosts', () => {
  it('splits net P/L by which rules the entry broke, each trade in one bucket', () => {
    const result = violationCosts([
      option(50, { openedAt: FREE }),
      option(-30, { openedAt: LOCKED }),
      option(-20, { openedAt: FREE, quantity: 3 }),
      option(-15, { openedAt: LOCKED, quantity: 3 }),
      option(10, { openedAt: FREE }),
    ]);

    expect(result).toEqual({
      followed: { trades: 2, net: 60 },
      window: { trades: 1, net: -30 },
      size: { trades: 1, net: -20 },
      both: { trades: 1, net: -15 },
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
