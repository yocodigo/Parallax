import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { tradeRuleChecks, trades } from '@/db/schema';
import { saveBreakerSettings } from '@/db/settings';
import { createStrategy } from '@/db/strategies';
import { resetDb } from '@/db/testing';
import { DEFAULT_BREAKER_SETTINGS } from '@/lib/circuitBreakerSettings';
import { POST } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const plan = {
  mode: 'paper',
  symbol: 'SPY',
  assetClass: 'stock',
  direction: 'long',
  quantity: 10,
  plannedEntry: 100,
  initialStop: 98,
};

const entry = { entryPrice: 100.2, openedAt: '2026-10-20T14:00:00.000Z' };

// A paper trade that lost 2R and closed just now, tripping a 2R daily limit.
async function lostTwoRToday() {
  const closedAt = new Date();
  await insertTrade({
    entryPrice: 100,
    exitPrice: 96,
    openedAt: new Date(closedAt.getTime() - 60_000),
    closedAt,
  });
}

const dailyLimit = (modes = ['paper']) => saveBreakerSettings(getDb(), { ...DEFAULT_BREAKER_SETTINGS, maxDailyLossR: 2, modes });

async function insertTrade(values = {}) {
  const [trade] = await getDb().insert(trades).values({ ...plan, ...values }).returning();
  return trade;
}

// Route handlers get their dynamic segments as a promise.
const post = (id, body) =>
  POST(
    new Request(`http://localhost/api/trades/${id}/entry`, { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) }
  );

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('POST /api/trades/[id]/entry', () => {
  it("records a planned trade's entry fill", async () => {
    const trade = await insertTrade();

    const response = await post(trade.id, entry);

    expect(response.status).toBe(200);
    expect((await response.json()).trade).toMatchObject({
      id: trade.id,
      entryPrice: 100.2,
      openedAt: entry.openedAt,
    });
  });

  it('rejects an invalid fill', async () => {
    const trade = await insertTrade();

    const response = await post(trade.id, { entryPrice: -1, openedAt: entry.openedAt });

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty('entryPrice');
  });

  it('refuses a trade that already has an entry', async () => {
    const trade = await insertTrade({ entryPrice: 100, openedAt: new Date(entry.openedAt) });

    const response = await post(trade.id, entry);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/already has an entry/i);
  });

  it('answers 404 for a trade that does not exist, or an id that is not one', async () => {
    expect((await post('00000000-0000-4000-8000-000000000000', entry)).status).toBe(404);
    expect((await post('not-a-uuid', entry)).status).toBe(404);
  });
});

describe('POST /api/trades/[id]/entry with circuit breakers', () => {
  it('refuses the entry while a breaker is tripped, saying which', async () => {
    await dailyLimit();
    await lostTwoRToday();
    const trade = await insertTrade();

    const response = await post(trade.id, entry);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Circuit breaker tripped',
      breakers: [{ breaker: 'dailyLoss', limitR: 2, todayR: -2 }],
    });
    expect((await getDb().select().from(trades)).find((t) => t.id === trade.id).openedAt).toBeNull();
  });

  it('records the entry when overridden, noting which breakers were', async () => {
    await dailyLimit();
    await lostTwoRToday();
    const trade = await insertTrade();

    const response = await post(trade.id, { ...entry, override: true });

    expect(response.status).toBe(200);
    expect((await response.json()).trade).toMatchObject({ entryPrice: 100.2, overriddenBreakers: ['dailyLoss'] });
  });

  it('lets trades in other modes through', async () => {
    await dailyLimit(['live']);
    await lostTwoRToday();
    const trade = await insertTrade();

    expect((await post(trade.id, entry)).status).toBe(200);
  });
});

describe('POST /api/trades/[id]/entry with a strategy checklist', () => {
  async function tradeWithStrategy() {
    const strategy = await createStrategy(getDb(), {
      name: '15m BB acceptance',
      description: null,
      rules: [
        { text: 'Accepted above the 15m band', kind: 'edge' },
        { text: 'Not the first impulsive bar', kind: 'edge' },
      ],
    });
    const trade = await insertTrade({ strategyId: strategy.id });
    const [accepted, notFirstBar] = strategy.rules;
    return { trade, accepted, notFirstBar };
  }

  const isOpen = async (id) => (await getDb().select().from(trades)).find((t) => t.id === id).openedAt !== null;

  it('needs every rule answered', async () => {
    const { trade, accepted } = await tradeWithStrategy();

    const response = await post(trade.id, { ...entry, ruleChecks: { [accepted.id]: true } });

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors.ruleChecks).toEqual(['Answer every rule on the checklist']);
  });

  it('records the entry and the answers when every rule is met', async () => {
    const { trade, accepted, notFirstBar } = await tradeWithStrategy();

    const response = await post(trade.id, { ...entry, ruleChecks: { [accepted.id]: true, [notFirstBar.id]: true } });

    expect(response.status).toBe(200);
    expect(await getDb().select().from(tradeRuleChecks)).toHaveLength(2);
  });

  it('asks for confirmation when a rule is not met, naming it', async () => {
    const { trade, accepted, notFirstBar } = await tradeWithStrategy();

    const response = await post(trade.id, { ...entry, ruleChecks: { [accepted.id]: true, [notFirstBar.id]: false } });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Checklist not met', unmetRules: ['Not the first impulsive bar'] });
    expect(await isOpen(trade.id)).toBe(false);
  });

  it('records an entry made against the checklist when overridden, with the answers as given', async () => {
    const { trade, accepted, notFirstBar } = await tradeWithStrategy();

    const response = await post(trade.id, {
      ...entry,
      ruleChecks: { [accepted.id]: true, [notFirstBar.id]: false },
      override: true,
    });

    expect(response.status).toBe(200);
    const checks = await getDb().select().from(tradeRuleChecks);
    expect(checks.find((c) => c.ruleText === 'Not the first impulsive bar').met).toBe(false);
  });
});
