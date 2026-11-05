import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addContextSetups, getTradeContext, listContextsWithoutSetups, saveTradeContext } from '../contexts';
import { trades } from '../schema';
import { createTestDb, resetDb } from '../testing';

const db = createTestDb();

const context = { version: 1, market: { spyTrend: 'up', vix: null }, option: null };

async function insertTrade() {
  const [trade] = await db
    .insert(trades)
    .values({ mode: 'paper', symbol: 'SPY', assetClass: 'stock', direction: 'long', quantity: 1 })
    .returning();
  return trade;
}

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

describe('trade contexts', () => {
  it('saves and reads back the snapshot for a trade', async () => {
    const trade = await insertTrade();

    await saveTradeContext(db, trade.id, context);

    expect(await getTradeContext(db, trade.id)).toEqual(context);
  });

  it('is null for a trade without one', async () => {
    const trade = await insertTrade();

    expect(await getTradeContext(db, trade.id)).toBeNull();
  });

  it('keeps the first snapshot if one is saved again', async () => {
    const trade = await insertTrade();
    await saveTradeContext(db, trade.id, context);

    await saveTradeContext(db, trade.id, { ...context, version: 2 });

    expect((await getTradeContext(db, trade.id)).version).toBe(1);
  });
});

describe('adding setups to older snapshots', () => {
  const openedAt = new Date('2026-10-27T13:56:00Z');
  const setups = { fourTouch: { kind: '4xBD', grade: { grade: 'A' } } };

  async function insertOpenedTrade(values = {}) {
    const [trade] = await db
      .insert(trades)
      .values({ mode: 'live', symbol: 'SPY', assetClass: 'stock', direction: 'long', quantity: 1, openedAt, ...values })
      .returning();
    return trade;
  }

  it('lists the opened trades whose snapshot has no setups, oldest first', async () => {
    const later = await insertOpenedTrade({ symbol: 'QQQ', openedAt: new Date('2026-10-28T14:00:00Z') });
    const earlier = await insertOpenedTrade();
    const done = await insertOpenedTrade();
    const noSnapshot = await insertOpenedTrade();
    await saveTradeContext(db, later.id, context);
    await saveTradeContext(db, earlier.id, context);
    await saveTradeContext(db, done.id, { ...context, version: 2, setups: null });

    const listed = await listContextsWithoutSetups(db);

    expect(listed.map((trade) => trade.id)).toEqual([earlier.id, later.id]);
    expect(listed.map((trade) => trade.id)).not.toContain(noSnapshot.id);
    expect(listed[1]).toMatchObject({ symbol: 'QQQ', assetClass: 'stock', direction: 'long' });
    expect(listed[1].openedAt).toEqual(new Date('2026-10-28T14:00:00Z'));
  });

  it('adds the setups and marks the snapshot version 2, keeping the rest', async () => {
    const trade = await insertOpenedTrade();
    await saveTradeContext(db, trade.id, context);

    await addContextSetups(db, trade.id, setups);

    expect(await getTradeContext(db, trade.id)).toEqual({ ...context, version: 2, setups });
  });

  it('never replaces setups a snapshot already has', async () => {
    const trade = await insertOpenedTrade();
    await saveTradeContext(db, trade.id, { ...context, version: 2, setups: null });

    await addContextSetups(db, trade.id, setups);

    expect((await getTradeContext(db, trade.id)).setups).toBeNull();
  });
});
