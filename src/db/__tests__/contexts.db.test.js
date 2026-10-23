import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTradeContext, saveTradeContext } from '../contexts';
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
