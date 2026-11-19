import { describe, expect, it } from 'vitest';
import { todaySummary } from '../today';

// A closed SPY call bought at 1.00 and sold at 1.50: $50 gross, $48.70 net.
function trade(overrides = {}) {
  return {
    id: 't1',
    direction: 'long',
    quantity: 1,
    multiplier: 100,
    entryPrice: 1,
    exitPrice: 1.5,
    fees: 1.3,
    openedAt: new Date('2026-11-19T14:40:00Z'),
    closedAt: new Date('2026-11-19T14:52:00Z'),
    ...overrides,
  };
}

const open = { exitPrice: null, closedAt: null };
const fib = { tradeDate: '2026-11-19', symbol: 'SPY', ltfDirection: 'bullish', ltfFib50: 590, ltfFib100: 595 };
const overnightOnly = { tradeDate: '2026-11-19', symbol: 'SPY', ltfFib50: null, asiaHigh: 592 };
const review = (tradeId, overrides = {}) => ({ id: `r-${tradeId}`, kind: 'review', tradeId, coaching: null, ...overrides });

describe('todaySummary', () => {
  it('starts an empty day with only the plan to do', () => {
    const summary = todaySummary({ plans: [], trades: [], reviews: [] });
    expect(summary.steps).toEqual({
      plan: 'todo',
      import: 'todo',
      review: { status: 'waiting', done: 0, of: 0 },
      coach: { status: 'waiting', done: 0, of: 0 },
    });
    expect(summary).toMatchObject({ tradeCount: 0, netPnl: 0, reviewed: 0, closedCount: 0, rows: [] });
  });

  it('counts the plan done only once a working fib is saved', () => {
    expect(todaySummary({ plans: [overnightOnly], trades: [], reviews: [] }).steps.plan).toBe('started');
    expect(todaySummary({ plans: [overnightOnly, fib], trades: [], reviews: [] }).steps.plan).toBe('done');
  });

  it('counts the import done when every trade of the day has an exit', () => {
    const closed = todaySummary({ plans: [], trades: [trade()], reviews: [] });
    expect(closed.steps.import).toBe('done');

    const stillOpen = todaySummary({ plans: [], trades: [trade(), trade({ id: 't2', ...open })], reviews: [] });
    expect(stillOpen.steps.import).toBe('open');
  });

  it('sums net P/L of the closed trades in whole cents', () => {
    // 48.70 + 0.10 - 0.30 in floating point is 48.500000000000004.
    const trades = [trade(), trade({ id: 't2', exitPrice: 1.001, fees: 0 }), trade({ id: 't3', exitPrice: 0.997, fees: 0 }), trade({ id: 't4', ...open })];
    const summary = todaySummary({ plans: [], trades, reviews: [] });
    expect(summary.netPnl).toBe(48.5);
    expect(summary).toMatchObject({ tradeCount: 4, closedCount: 3 });
  });

  it('asks for a review of each closed trade, and coaching of each review', () => {
    const trades = [trade(), trade({ id: 't2' }), trade({ id: 't3', ...open })];
    const reviews = [review('t1', { coaching: 'Held to T1.' }), review('t2')];

    const partly = todaySummary({ plans: [], trades, reviews: [reviews[0]] });
    expect(partly.steps.review).toEqual({ status: 'todo', done: 1, of: 2 });
    expect(partly.steps.coach).toEqual({ status: 'done', done: 1, of: 1 });

    const summary = todaySummary({ plans: [], trades, reviews });
    expect(summary.reviewed).toBe(2);
    expect(summary.steps.review).toEqual({ status: 'done', done: 2, of: 2 });
    expect(summary.steps.coach).toEqual({ status: 'todo', done: 1, of: 2 });
  });

  it('gives each trade a row, in the order given, with its P/L and its reviews', () => {
    const trades = [trade(), trade({ id: 't2', ...open })];
    const reviews = [review('t1'), review('t1', { id: 'r-again' })];
    const { rows } = todaySummary({ plans: [], trades, reviews });

    expect(rows.map((row) => row.trade.id)).toEqual(['t1', 't2']);
    expect(rows[0].pnl).toBeCloseTo(48.7);
    expect(rows[0].reviews.map((r) => r.id)).toEqual(['r-t1', 'r-again']);
    expect(rows[1]).toMatchObject({ pnl: null, reviews: [] });
  });

  it('counts a trade reviewed once however many reviews it has', () => {
    const reviews = [review('t1'), review('t1', { id: 'r-again', coaching: 'x' })];
    const summary = todaySummary({ plans: [], trades: [trade()], reviews });
    expect(summary.reviewed).toBe(1);
    expect(summary.steps.coach).toEqual({ status: 'todo', done: 1, of: 2 });
  });
});
