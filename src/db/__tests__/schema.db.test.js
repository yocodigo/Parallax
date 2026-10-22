import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, resetDb } from '../testing';
import { circuitBreakerSettings, journalEntries, strategies, strategyRules, tradeRuleChecks, trades } from '../schema';

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

  it("stores an option's type, strike, and expiration", async () => {
    const [trade] = await db
      .insert(trades)
      .values({ ...plan, assetClass: 'option', optionType: 'call', strike: 500, expiration: '2026-10-23' })
      .returning();

    expect(trade).toMatchObject({ optionType: 'call', strike: 500, expiration: '2026-10-23' });
  });

  it('leaves the option fields empty for a stock', async () => {
    const [trade] = await db.insert(trades).values(plan).returning();

    expect(trade).toMatchObject({ optionType: null, strike: null, expiration: null });
  });

  it('rejects option fields on a stock', async () => {
    await expect(db.insert(trades).values({ ...plan, strike: 500 })).rejects.toMatchObject({
      cause: { constraint: 'trades_option_fields_only_on_options' },
    });
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

describe('strategies and rules', () => {
  async function strategyWithRule() {
    const [strategy] = await db.insert(strategies).values({ name: '15m BB acceptance' }).returning();
    const [rule] = await db
      .insert(strategyRules)
      .values({ strategyId: strategy.id, text: 'Accepted above the 15m band', kind: 'edge', position: 0 })
      .returning();
    return { strategy, rule };
  }

  it('links a trade to its strategy and records its rule checks', async () => {
    const { strategy, rule } = await strategyWithRule();
    const [trade] = await db.insert(trades).values({ ...plan, strategyId: strategy.id }).returning();

    const [check] = await db.insert(tradeRuleChecks).values({ tradeId: trade.id, ruleId: rule.id, ruleText: rule.text, met: true }).returning();

    expect(check).toMatchObject({ tradeId: trade.id, ruleId: rule.id, met: true });
  });

  it('keeps trades when their strategy is deleted', async () => {
    const { strategy } = await strategyWithRule();
    const [trade] = await db.insert(trades).values({ ...plan, strategyId: strategy.id }).returning();

    await db.delete(strategies).where(eq(strategies.id, strategy.id));

    const [kept] = await db.select().from(trades).where(eq(trades.id, trade.id));
    expect(kept.strategyId).toBeNull();
  });

  it("keeps a trade's checks, with the rule's text, when the rule is deleted", async () => {
    const { strategy, rule } = await strategyWithRule();
    const [trade] = await db.insert(trades).values({ ...plan, strategyId: strategy.id }).returning();
    await db.insert(tradeRuleChecks).values({ tradeId: trade.id, ruleId: rule.id, ruleText: rule.text, met: false });

    await db.delete(strategyRules).where(eq(strategyRules.id, rule.id));

    const [check] = await db.select().from(tradeRuleChecks);
    expect(check).toMatchObject({ ruleId: null, ruleText: 'Accepted above the 15m band', met: false });
  });

  it('rejects an unknown rule kind', async () => {
    const { strategy } = await strategyWithRule();

    await expect(
      db.insert(strategyRules).values({ strategyId: strategy.id, text: 'x', kind: 'vibes', position: 1 })
    ).rejects.toThrow();
  });

  it('checks each rule once per trade', async () => {
    const { strategy, rule } = await strategyWithRule();
    const [trade] = await db.insert(trades).values({ ...plan, strategyId: strategy.id }).returning();
    await db.insert(tradeRuleChecks).values({ tradeId: trade.id, ruleId: rule.id, ruleText: rule.text, met: true });

    await expect(
      db.insert(tradeRuleChecks).values({ tradeId: trade.id, ruleId: rule.id, ruleText: rule.text, met: false })
    ).rejects.toThrow();
  });
});
