import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addContextSetupsAndLevels,
  getTradeContext,
  listContextDeltas,
  listContextDetected,
  listContextGrades,
  listContextLevels,
  listContextsWithoutLevels,
  saveTradeContext,
} from '../contexts';
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

describe('bringing older snapshots up to version 3', () => {
  const openedAt = new Date('2026-10-27T13:56:00Z');
  const setups = { fourTouch: { kind: '4xBD', grade: { grade: 'A' } }, detected: [] };
  const levels = [{ kind: 'prior_day_high', price: 580, tier: 1 }];

  async function insertOpenedTrade(values = {}) {
    const [trade] = await db
      .insert(trades)
      .values({ mode: 'live', symbol: 'SPY', assetClass: 'stock', direction: 'long', quantity: 1, openedAt, ...values })
      .returning();
    return trade;
  }

  it('lists the opened trades whose snapshot has no levels yet, version 1 or 2, oldest first', async () => {
    const later = await insertOpenedTrade({ symbol: 'QQQ', openedAt: new Date('2026-10-28T14:00:00Z') });
    const earlier = await insertOpenedTrade();
    const done = await insertOpenedTrade();
    const noSnapshot = await insertOpenedTrade();
    await saveTradeContext(db, later.id, context);
    await saveTradeContext(db, earlier.id, { ...context, version: 2, setups: null });
    await saveTradeContext(db, done.id, { ...context, version: 3, setups: null, levels: null });

    const listed = await listContextsWithoutLevels(db);

    expect(listed.map((trade) => trade.id)).toEqual([earlier.id, later.id]);
    expect(listed.map((trade) => trade.id)).not.toContain(noSnapshot.id);
    expect(listed[1]).toMatchObject({ symbol: 'QQQ', assetClass: 'stock', direction: 'long' });
    expect(listed[1].openedAt).toEqual(new Date('2026-10-28T14:00:00Z'));
  });

  it('sets the setups and levels and marks the snapshot version 3, keeping the rest', async () => {
    const trade = await insertOpenedTrade();
    await saveTradeContext(db, trade.id, { ...context, version: 2, setups: { fourTouch: null } });

    await addContextSetupsAndLevels(db, trade.id, { setups, levels });

    expect(await getTradeContext(db, trade.id)).toEqual({ ...context, version: 3, setups, levels });
  });

  it('never replaces a snapshot that already has levels', async () => {
    const trade = await insertOpenedTrade();
    await saveTradeContext(db, trade.id, { ...context, version: 3, setups: null, levels: null });

    await addContextSetupsAndLevels(db, trade.id, { setups, levels });

    expect(await getTradeContext(db, trade.id)).toMatchObject({ setups: null, levels: null });
  });
});

describe('listContextGrades', () => {
  it('gives the four-touch grade each trade went with: A, B, none, or null when unknown', async () => {
    const ids = [];
    for (let i = 0; i < 6; i++) ids.push((await insertTrade()).id);
    const [idA, idB, idNone, idNoBars, idV1, idBare] = ids;
    await saveTradeContext(db, idA, { version: 2, setups: { fourTouch: { grade: { grade: 'A' } } } });
    await saveTradeContext(db, idB, { version: 2, setups: { fourTouch: { grade: { grade: 'B' } } } });
    await saveTradeContext(db, idNone, { version: 2, setups: { fourTouch: null } });
    await saveTradeContext(db, idNoBars, { version: 2, setups: null });
    await saveTradeContext(db, idV1, context);

    const grades = await listContextGrades(db, ids);

    expect(grades.get(idA)).toBe('A');
    expect(grades.get(idB)).toBe('B');
    expect(grades.get(idNone)).toBe('none');
    expect(grades.get(idNoBars)).toBeNull();
    expect(grades.get(idV1)).toBeNull();
    expect(grades.get(idBare)).toBeNull();
  });

  it('returns nothing for no trades', async () => {
    expect((await listContextGrades(db, [])).size).toBe(0);
  });
});

describe('listContextDetected', () => {
  it('gives the setups each snapshot detected at entry, or null before version 3 or without bars', async () => {
    const [v3, empty, withoutBars, v2, none] = await Promise.all([1, 2, 3, 4, 5].map(() => insertTrade()));
    const detected = [{ detector: 'band_cross', status: 'complete', grade: null, barsSince: 1 }];
    await saveTradeContext(db, v3.id, { ...context, version: 3, setups: { fourTouch: null, detected }, levels: [] });
    await saveTradeContext(db, empty.id, { ...context, version: 3, setups: { fourTouch: null, detected: [] }, levels: [] });
    await saveTradeContext(db, withoutBars.id, { ...context, version: 3, setups: null, levels: null });
    await saveTradeContext(db, v2.id, { ...context, version: 2, setups: { fourTouch: null } });

    const found = await listContextDetected(db, [v3.id, empty.id, withoutBars.id, v2.id, none.id]);

    expect(found.get(v3.id)).toEqual(detected);
    expect(found.get(empty.id)).toEqual([]);
    expect([withoutBars.id, v2.id, none.id].map((id) => found.get(id))).toEqual([null, null, null]);
  });

  it('asks nothing for no trades', async () => {
    expect(await listContextDetected(db, [])).toEqual(new Map());
  });
});

describe('listContextLevels', () => {
  it('gives the level map each snapshot kept at entry, or an empty one when it kept none', async () => {
    const [v3, v2, none] = await Promise.all([1, 2, 3].map(() => insertTrade()));
    const levels = [{ kind: 'prior_day_high', price: 580, tier: 1, side: 'above', touchedToday: false, formedAt: null }];
    await saveTradeContext(db, v3.id, { ...context, version: 3, setups: null, levels });
    await saveTradeContext(db, v2.id, { ...context, version: 2, setups: null });

    const found = await listContextLevels(db, [v3.id, v2.id, none.id]);

    expect(found.get(v3.id)).toEqual(levels);
    expect(found.get(v2.id)).toEqual([]);
    expect(found.get(none.id)).toEqual([]);
  });
});

describe('listContextDeltas', () => {
  it("gives the option delta each trade's snapshot kept, or null when it kept none", async () => {
    const [kept, stale, stock, bare] = [await insertTrade(), await insertTrade(), await insertTrade(), await insertTrade()];
    await saveTradeContext(db, kept.id, { version: 2, option: { delta: 0.48, iv: 0.2 } });
    // Captured too long after the fill: the live values were left null.
    await saveTradeContext(db, stale.id, { version: 2, option: { delta: null } });
    await saveTradeContext(db, stock.id, { version: 2, option: null });

    const deltas = await listContextDeltas(db, [kept.id, stale.id, stock.id, bare.id]);

    expect([...deltas]).toEqual([
      [kept.id, 0.48],
      [stale.id, null],
      [stock.id, null],
      [bare.id, null],
    ]);
  });

  it('asks nothing for no trades', async () => {
    expect((await listContextDeltas(db, [])).size).toBe(0);
  });
});

