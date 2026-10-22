import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, resetDb } from '../testing';
import { circuitBreakerSettings, journalEntries, trades } from '../schema';

const db = createTestDb();

const plan = {
  mode: 'paper',
  symbol: 'SPY',
  assetClass: 'stock',
  direction: 'long',
  quantity: 10,
};

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

describe('trades table', () => {
  it('fills in defaults for a minimal plan', async () => {
    const [trade] = await db.insert(trades).values(plan).returning();

    expect(trade).toMatchObject({ multiplier: 1, fees: 0, openedAt: null, closedAt: null });
  });

  it('rejects a quantity that is not positive', async () => {
    await expect(db.insert(trades).values({ ...plan, quantity: 0 })).rejects.toMatchObject({
      cause: { constraint: 'trades_quantity_positive' },
    });
  });

  it('records no overridden circuit breakers by default', async () => {
    const [trade] = await db.insert(trades).values(plan).returning();

    expect(trade.overriddenBreakers).toEqual([]);
  });

  it('rejects closing a trade that was never opened', async () => {
    await expect(
      db.insert(trades).values({ ...plan, closedAt: new Date() })
    ).rejects.toMatchObject({ cause: { constraint: 'trades_closed_after_opened' } });
  });
});

describe('journal_entries table', () => {
  it('defaults mistakes to an empty list', async () => {
    const [entry] = await db
      .insert(journalEntries)
      .values({ kind: 'review', notes: 'Chased the open again' })
      .returning();

    expect(entry.mistakes).toEqual([]);
  });

  it('keeps entries when their trade is deleted', async () => {
    const [trade] = await db.insert(trades).values(plan).returning();
    await db
      .insert(journalEntries)
      .values({ tradeId: trade.id, kind: 'plan', notes: 'Waiting for a VWAP reclaim' });

    await db.delete(trades).where(eq(trades.id, trade.id));

    const [entry] = await db.select().from(journalEntries);
    expect(entry.tradeId).toBeNull();
    expect(entry.notes).toBe('Waiting for a VWAP reclaim');
  });
});
describe('circuit_breaker_settings table', () => {
  it('starts with every limit off, counting live trades', async () => {
    const [settings] = await db.insert(circuitBreakerSettings).values({}).returning();

    expect(settings).toMatchObject({
      id: 1,
      maxDailyLossR: null,
      maxTradesPerDay: null,
      cooldownAfterLosses: null,
      cooldownMinutes: null,
      modes: ['live'],
    });
  });

  it('holds a single row', async () => {
    await db.insert(circuitBreakerSettings).values({});

    await expect(db.insert(circuitBreakerSettings).values({ id: 2 })).rejects.toMatchObject({
      cause: { constraint: 'circuit_breaker_settings_single_row' },
    });
  });
});
