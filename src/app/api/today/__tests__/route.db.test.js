import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { saveDailyPlan } from '@/db/dailyPlans';
import { journalEntries, trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { GET } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

// A closed SPY call: $50 gross, $48.70 net.
const call = (overrides = {}) => ({
  mode: 'live',
  symbol: 'SPY',
  assetClass: 'option',
  direction: 'long',
  quantity: 1,
  multiplier: 100,
  optionType: 'call',
  strike: 590,
  expiration: '2026-11-19',
  entryPrice: 1,
  exitPrice: 1.5,
  fees: 1.3,
  openedAt: new Date('2026-11-19T14:40:00Z'),
  closedAt: new Date('2026-11-19T14:52:00Z'),
  ...overrides,
});

const insertTrade = async (overrides) => {
  const [trade] = await getDb().insert(trades).values(call(overrides)).returning();
  return trade;
};
const insertEntry = (values) => getDb().insert(journalEntries).values({ mode: 'live', notes: 'n', ...values });

const get = (query = '') => GET(new Request(`http://localhost/api/today${query}`));

beforeEach(() => resetDb(getDb()));
afterEach(() => vi.useRealTimers());
afterAll(() => getDb().$client.end());

describe('GET /api/today', () => {
  it("answers an empty day with only the plan to do", async () => {
    const response = await get('?day=2026-11-19');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ day: '2026-11-19', mode: 'live', plans: [] });
    expect(body.summary).toMatchObject({ tradeCount: 0, netPnl: 0, rows: [] });
    expect(body.summary.steps.plan).toBe('todo');
  });

  it("defaults to today's New York date", async () => {
    // 03:00 UTC on the 20th is still the evening of the 19th in New York.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T03:00:00Z'));

    expect((await (await get()).json()).day).toBe('2026-11-19');
  });

  it("returns the day's plans, every symbol's", async () => {
    await saveDailyPlan(getDb(), { tradeDate: '2026-11-19', symbol: 'SPY', ltfDirection: 'bullish', ltfFib50: 590, ltfFib100: 595 });
    await saveDailyPlan(getDb(), { tradeDate: '2026-11-19', symbol: 'QQQ', asiaHigh: 510 });
    await saveDailyPlan(getDb(), { tradeDate: '2026-11-18', symbol: 'SPY', asiaHigh: 588 });

    const body = await (await get('?day=2026-11-19')).json();
    expect(body.plans.map((plan) => plan.symbol)).toEqual(['QQQ', 'SPY']);
    expect(body.summary.steps.plan).toBe('done');
  });

  it('lists the trades opened that New York day in the mode, with their reviews', async () => {
    const first = await insertTrade();
    const second = await insertTrade({ openedAt: new Date('2026-11-19T19:00:00Z'), exitPrice: null, closedAt: null });
    // 23:30 on the 18th in New York.
    await insertTrade({ openedAt: new Date('2026-11-19T04:30:00Z'), closedAt: new Date('2026-11-19T04:40:00Z') });
    await insertTrade({ mode: 'paper' });
    await insertEntry({ kind: 'plan', tradeId: first.id });
    await insertEntry({ kind: 'review', tradeId: first.id, coaching: 'Held to T1.' });

    const body = await (await get('?day=2026-11-19')).json();
    const { rows, steps } = body.summary;
    expect(rows.map((row) => row.trade.id)).toEqual([first.id, second.id]);
    expect(rows[0].reviews).toHaveLength(1);
    expect(rows[0].reviews[0]).toMatchObject({ kind: 'review', coaching: 'Held to T1.' });
    expect(body.summary).toMatchObject({ tradeCount: 2, closedCount: 1, netPnl: 48.7, reviewed: 1 });
    expect(steps.import).toBe('open');
  });

  it('reads another mode when asked', async () => {
    await insertTrade();
    const paper = await insertTrade({ mode: 'paper' });

    const body = await (await get('?day=2026-11-19&mode=paper')).json();
    expect(body.mode).toBe('paper');
    expect(body.summary.rows.map((row) => row.trade.id)).toEqual([paper.id]);
  });

  it('rejects a day that is not a date and an unknown mode', async () => {
    const response = await get('?day=19-11-2026&mode=demo');

    expect(response.status).toBe(400);
    const { fieldErrors } = await response.json();
    expect(fieldErrors.day).toBeDefined();
    expect(fieldErrors.mode).toBeDefined();
  });
});
