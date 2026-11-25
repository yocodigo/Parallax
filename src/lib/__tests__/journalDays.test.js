import { describe, expect, it } from 'vitest';
import { journalDays } from '../journalDays';

// A closed SPY call bought at 1.00 and sold at 1.50: $50 gross, $48.70 net.
const trade = (id, overrides = {}) => ({
  id,
  direction: 'long',
  quantity: 1,
  multiplier: 100,
  entryPrice: 1,
  exitPrice: 1.5,
  fees: 1.3,
  openedAt: '2026-11-19T14:40:00Z',
  closedAt: '2026-11-19T14:52:00Z',
  ...overrides,
});
const entry = (id, kind, createdAt, overrides = {}) => ({ id, kind, createdAt, tradeId: null, trade: null, ...overrides });
const linked = (id, kind, createdAt, t) => entry(id, kind, createdAt, { tradeId: t.id, trade: t });

describe('journalDays', () => {
  it('is empty with no entries', () => {
    expect(journalDays([])).toEqual([]);
  });

  it('puts a trade and its plan and review in one row, on the day it was opened', () => {
    const t = trade('t1');
    const days = journalDays([
      linked('r1', 'review', '2026-11-20T02:00:00Z', t),
      linked('p1', 'plan', '2026-11-19T14:30:00Z', t),
    ]);

    expect(days).toHaveLength(1);
    expect(days[0].day).toBe('2026-11-19');
    expect(days[0].items).toHaveLength(1);
    expect(days[0].items[0]).toMatchObject({ type: 'trade', trade: t });
    expect(days[0].items[0].entries.map((e) => e.id)).toEqual(['r1', 'p1']);
  });

  it('puts a plan never filled on the New York day it was written', () => {
    const t = trade('t1', { openedAt: null, closedAt: null, exitPrice: null });
    // 03:00 UTC on the 20th is still the evening of the 19th in New York.
    const days = journalDays([linked('p1', 'plan', '2026-11-20T03:00:00Z', t)]);
    expect(days[0].day).toBe('2026-11-19');
  });

  it('keeps plans and theses with no trade as their own rows in their day', () => {
    const days = journalDays([entry('th1', 'thesis', '2026-11-19T15:00:00Z', { symbol: 'AAPL' })]);
    expect(days[0].items).toEqual([{ type: 'entry', entry: expect.objectContaining({ id: 'th1' }), at: new Date('2026-11-19T15:00:00Z') }]);
    expect(days[0].summary.tradeCount).toBe(0);
  });

  it('lists days newest first and rows within a day newest first', () => {
    const a = trade('a', { openedAt: '2026-11-19T14:40:00Z' });
    const b = trade('b', { openedAt: '2026-11-19T16:10:00Z', closedAt: '2026-11-19T16:20:00Z' });
    const c = trade('c', { openedAt: '2026-11-18T15:00:00Z', closedAt: '2026-11-18T15:10:00Z' });
    const days = journalDays([
      linked('pa', 'plan', '2026-11-19T14:30:00Z', a),
      linked('pb', 'plan', '2026-11-19T16:00:00Z', b),
      linked('pc', 'plan', '2026-11-18T14:50:00Z', c),
    ]);

    expect(days.map((d) => d.day)).toEqual(['2026-11-19', '2026-11-18']);
    expect(days[0].items.map((i) => i.trade.id)).toEqual(['b', 'a']);
  });

  it('summarizes the day: trades, net P/L of the closed ones, and reviewed of closed', () => {
    const won = trade('t1');
    const open = trade('t2', { exitPrice: null, closedAt: null, openedAt: '2026-11-19T17:00:00Z' });
    const lost = trade('t3', { exitPrice: 0.5, openedAt: '2026-11-19T15:00:00Z' });
    const { summary } = journalDays([
      linked('p1', 'plan', '2026-11-19T14:30:00Z', won),
      linked('r1', 'review', '2026-11-19T15:00:00Z', won),
      linked('p2', 'plan', '2026-11-19T16:55:00Z', open),
      linked('p3', 'plan', '2026-11-19T14:55:00Z', lost),
    ])[0];

    expect(summary).toMatchObject({ tradeCount: 3, closedCount: 2, reviewed: 1 });
    expect(summary.netPnl).toBeCloseTo(48.7 - 51.3, 2);
  });
});
