import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { journalEntries, trades } from '../schema';
import { createTestDb, resetDb } from '../testing';
import { createStrategy } from '../strategies';
import {
  getTrade,
  listAllClosedTrades,
  listClosedTrades,
  listClosedTradesBetween,
  listClosedTradesWithMistakes,
  listClosedTradesWithRuleChecks,
  listPlanFacts,
  listReviewRatings,
  listRecentTrades,
  recordEntry,
  recordExit,
} from '../trades';

const db = createTestDb();

const plan = {
  mode: 'paper',
  symbol: 'SPY',
  assetClass: 'stock',
  direction: 'long',
  quantity: 10,
  plannedEntry: 100,
  initialStop: 98,
  target: 106,
};

const entry = { entryPrice: 100.2, openedAt: new Date('2026-10-20T14:00:00Z') };
const exit = {
  exitPrice: 105,
  closedAt: new Date('2026-10-21T15:00:00Z'),
  exitReason: 'target',
  exitedPerPlan: true,
  fees: 1,
};

async function insertTrade(values = {}) {
  const [trade] = await db.insert(trades).values({ ...plan, ...values }).returning();
  return trade;
}

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

describe('getTrade', () => {
  it('returns the trade, or null when there is none', async () => {
    const trade = await insertTrade();

    expect(await getTrade(db, trade.id)).toMatchObject({ id: trade.id, symbol: 'SPY' });
    expect(await getTrade(db, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('recordEntry', () => {
  it('records the fill on a planned trade', async () => {
    const trade = await insertTrade();

    const updated = await recordEntry(db, trade.id, entry);

    expect(updated).toMatchObject({ entryPrice: 100.2, openedAt: entry.openedAt, closedAt: null });
  });

  it('records the circuit breakers overridden to enter it', async () => {
    const trade = await insertTrade();

    const updated = await recordEntry(db, trade.id, { ...entry, overriddenBreakers: ['dailyLoss'] });

    expect(updated.overriddenBreakers).toEqual(['dailyLoss']);
  });

  it('leaves a trade that was already entered alone', async () => {
    const trade = await insertTrade(entry);

    expect(await recordEntry(db, trade.id, { ...entry, entryPrice: 99 })).toBeNull();
    expect((await getTrade(db, trade.id)).entryPrice).toBe(100.2);
  });
});

describe('recordExit', () => {
  it('records the exit on an open trade', async () => {
    const trade = await insertTrade(entry);

    const updated = await recordExit(db, trade.id, exit);

    expect(updated).toMatchObject({
      exitPrice: 105,
      closedAt: exit.closedAt,
      exitReason: 'target',
      exitedPerPlan: true,
      fees: 1,
    });
  });

  it('leaves a planned trade alone, since it has no entry yet', async () => {
    const trade = await insertTrade();

    expect(await recordExit(db, trade.id, exit)).toBeNull();
  });

  it('leaves a closed trade alone', async () => {
    const trade = await insertTrade({ ...entry, ...exit });

    expect(await recordExit(db, trade.id, { ...exit, exitPrice: 90 })).toBeNull();
    expect((await getTrade(db, trade.id)).exitPrice).toBe(105);
  });
});

describe('listClosedTrades', () => {
  const closed = (values) =>
    insertTrade({ ...values, entryPrice: 100, exitPrice: 101, closedAt: new Date('2026-10-22T15:00:00Z') });

  it("returns one symbol's closed trades, oldest entry first", async () => {
    const later = await closed({ openedAt: new Date('2026-10-21T14:00:00Z') });
    const earlier = await closed({ openedAt: new Date('2026-10-20T14:00:00Z') });
    await closed({ symbol: 'QQQ', openedAt: new Date('2026-10-20T15:00:00Z') });
    await insertTrade({ entryPrice: 100, openedAt: new Date('2026-10-20T16:00:00Z') });

    const rows = await listClosedTrades(db, { symbol: 'SPY' });
    expect(rows.map((trade) => trade.id)).toEqual([earlier.id, later.id]);
  });

  it('can be limited to one mode', async () => {
    await closed({ openedAt: new Date('2026-10-20T14:00:00Z') });
    const live = await closed({ mode: 'live', openedAt: new Date('2026-10-21T14:00:00Z') });

    const rows = await listClosedTrades(db, { symbol: 'SPY', mode: 'live' });
    expect(rows.map((trade) => trade.id)).toEqual([live.id]);
  });
});

// A closed option or stock trade, on 2026-10-22, with the setup it was taken for.
const closedOn = (values) =>
  insertTrade({
    ...values,
    entryPrice: 100,
    exitPrice: 101,
    openedAt: new Date('2026-10-22T14:00:00Z'),
    closedAt: new Date('2026-10-22T15:00:00Z'),
  });
const option = (optionType, values = {}) =>
  closedOn({ assetClass: 'option', optionType, strike: 500, expiration: '2026-10-23', initialStop: null, target: null, ...values });
const strategy = (name) =>
  createStrategy(db, { name, description: '', rules: [{ text: 'Trend aligned', kind: 'edge' }] });

const window = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-01T00:00:00Z') };

describe.each([
  ['listClosedTradesBetween', (filters) => listClosedTradesBetween(db, { ...window, ...filters })],
  ['listAllClosedTrades', (filters) => listAllClosedTrades(db, filters)],
])('%s filters', (_name, list) => {
  it('limits to one setup, to trades with no setup (null), or to all (omitted)', async () => {
    const trend = await strategy('Trend pullback');
    const withSetup = await closedOn({ strategyId: trend.id });
    const without = await closedOn({});

    expect((await list({ strategyId: trend.id })).map((t) => t.id)).toEqual([withSetup.id]);
    expect((await list({ strategyId: null })).map((t) => t.id)).toEqual([without.id]);
    expect(await list({})).toHaveLength(2);
  });

  it('limits to calls or to puts, which leaves out stock trades', async () => {
    const call = await option('call');
    const put = await option('put');
    await closedOn({});

    expect((await list({ optionType: 'call' })).map((t) => t.id)).toEqual([call.id]);
    expect((await list({ optionType: 'put' })).map((t) => t.id)).toEqual([put.id]);
    expect(await list({})).toHaveLength(3);
  });

  it('combines with the asset class and with each other', async () => {
    const trend = await strategy('Trend pullback');
    const wanted = await option('call', { strategyId: trend.id });
    await option('put', { strategyId: trend.id });
    await option('call');
    await closedOn({ strategyId: trend.id });

    const rows = await list({ assetClass: 'option', strategyId: trend.id, optionType: 'call' });
    expect(rows.map((t) => t.id)).toEqual([wanted.id]);
  });
});

describe('listClosedTradesWithMistakes', () => {
  const closed = { ...entry, ...exit, exitReason: 'invalidation', exitPrice: 98 };

  async function tag(trade, kind, mistakes) {
    await db.insert(journalEntries).values({ tradeId: trade.id, kind, notes: 'Notes', mistakes });
  }

  it('returns each closed trade once, with the mistakes from all its entries', async () => {
    const trade = await insertTrade(closed);
    await tag(trade, 'plan', []);
    await tag(trade, 'review', ['moved_stop']);
    await tag(trade, 'review', ['moved_stop', 'oversized']);

    const rows = await listClosedTradesWithMistakes(db);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: trade.id, exitPrice: 98 });
    expect(rows[0].mistakes.sort()).toEqual(['moved_stop', 'moved_stop', 'oversized']);
  });

  it('includes a closed trade with no journal entries, with no mistakes', async () => {
    const trade = await insertTrade(closed);

    expect(await listClosedTradesWithMistakes(db)).toEqual([expect.objectContaining({ id: trade.id, mistakes: [] })]);
  });

  it('leaves out trades that are not closed', async () => {
    await insertTrade();
    await insertTrade(entry);

    expect(await listClosedTradesWithMistakes(db)).toEqual([]);
  });

  it('can be limited to one mode', async () => {
    await insertTrade({ ...closed, mode: 'paper' });
    const live = await insertTrade({ ...closed, mode: 'live' });

    const rows = await listClosedTradesWithMistakes(db, { mode: 'live' });

    expect(rows.map((row) => row.id)).toEqual([live.id]);
  });
});

describe('listClosedTradesWithRuleChecks', () => {
  const checks = [
    { ruleId: null, ruleText: 'Volume rising', met: true },
    { ruleId: null, ruleText: 'Not the first impulse bar', met: false },
  ];

  // Records the entry with its checklist, then the exit.
  async function closedWithChecks(values = {}, closedAt = exit.closedAt) {
    const trade = await insertTrade(values);
    await recordEntry(db, trade.id, { ...entry, ruleChecks: checks });
    await recordExit(db, trade.id, { ...exit, closedAt });
    return trade;
  }

  it('returns closed trades with their checklist answers, oldest exit first', async () => {
    const later = await closedWithChecks({}, new Date('2026-10-22T15:00:00Z'));
    const earlier = await closedWithChecks({}, new Date('2026-10-21T15:00:00Z'));

    const rows = await listClosedTradesWithRuleChecks(db);

    expect(rows.map((row) => row.id)).toEqual([earlier.id, later.id]);
    expect(rows[0]).toMatchObject({ exitPrice: 105, entryPrice: 100.2 });
    expect(rows[0].ruleChecks).toEqual(expect.arrayContaining(checks));
    expect(rows[0].ruleChecks).toHaveLength(2);
  });

  it('leaves out trades without a checklist and trades that are not closed', async () => {
    await insertTrade({ ...entry, ...exit });
    const open = await insertTrade();
    await recordEntry(db, open.id, { ...entry, ruleChecks: checks });

    expect(await listClosedTradesWithRuleChecks(db)).toEqual([]);
  });

  it('can be limited to one mode', async () => {
    await closedWithChecks({ mode: 'paper' });
    const live = await closedWithChecks({ mode: 'live' });

    const rows = await listClosedTradesWithRuleChecks(db, { mode: 'live' });

    expect(rows.map((row) => row.id)).toEqual([live.id]);
  });
});

describe('listRecentTrades', () => {
  it('returns entered trades in the given modes, latest activity first', async () => {
    await insertTrade();
    const older = await insertTrade({ ...entry, ...exit, mode: 'live' });
    const newer = await insertTrade({ mode: 'live', entryPrice: 101, openedAt: new Date('2026-10-22T14:00:00Z') });
    await insertTrade({ ...entry, mode: 'backtest' });

    const rows = await listRecentTrades(db, { modes: ['live'] });

    expect(rows.map((row) => row.id)).toEqual([newer.id, older.id]);
  });

  it('returns at most the requested number', async () => {
    for (let i = 0; i < 3; i += 1) await insertTrade({ ...entry, mode: 'live' });

    expect(await listRecentTrades(db, { modes: ['live'], limit: 2 })).toHaveLength(2);
  });
});

describe('listPlanFacts', () => {
  it('gives the time of the earliest plan entry and how many checklist answers were unmet, by trade', async () => {
    const withPlan = await insertTrade();
    await db.insert(journalEntries).values([
      { kind: 'plan', notes: 'n', tradeId: withPlan.id, createdAt: new Date('2026-10-20T13:00:00Z') },
      { kind: 'plan', notes: 'n', tradeId: withPlan.id, createdAt: new Date('2026-10-20T12:00:00Z') },
      { kind: 'review', notes: 'n', tradeId: withPlan.id, createdAt: new Date('2026-10-20T09:00:00Z') },
    ]);
    await recordEntry(db, withPlan.id, {
      ...entry,
      ruleChecks: [
        { ruleId: null, ruleText: 'Volume rising', met: true },
        { ruleId: null, ruleText: 'Not the first bar', met: false },
      ],
    });
    const bare = await insertTrade();

    const facts = await listPlanFacts(db, [withPlan.id, bare.id]);

    expect(facts.get(withPlan.id)).toEqual({
      planWrittenAt: new Date('2026-10-20T12:00:00Z'),
      unmetRuleCount: 1,
    });
    expect(facts.get(bare.id)).toEqual({ planWrittenAt: null, unmetRuleCount: 0 });
  });

  it('returns nothing for no trades', async () => {
    expect((await listPlanFacts(db, [])).size).toBe(0);
  });
});

describe('listReviewRatings', () => {
  it("gives the emotional-control ratings of each trade's review entries, by trade", async () => {
    const rated = await insertTrade();
    await db.insert(journalEntries).values([
      { kind: 'review', notes: 'n', tradeId: rated.id, emotionalControl: 4 },
      { kind: 'review', notes: 'n', tradeId: rated.id, emotionalControl: 7 },
      { kind: 'review', notes: 'unrated', tradeId: rated.id },
      { kind: 'plan', notes: 'n', tradeId: rated.id },
    ]);
    const bare = await insertTrade();

    const ratings = await listReviewRatings(db, [rated.id, bare.id]);

    expect([...ratings.get(rated.id)].sort()).toEqual([4, 7]);
    expect(ratings.get(bare.id)).toEqual([]);
  });

  it('returns nothing for no trades', async () => {
    expect((await listReviewRatings(db, [])).size).toBe(0);
  });
});
