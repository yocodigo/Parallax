import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { journalEntries, trades } from '../schema';
import { createTestDb, resetDb } from '../testing';
import { getTrade, listClosedTradesWithMistakes, recordEntry, recordExit } from '../trades';

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

describe('listClosedTradesWithMistakes', () => {
  const closed = { ...entry, ...exit, exitReason: 'stop', exitPrice: 98 };

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
