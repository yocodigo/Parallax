import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { trades, tradeRuleChecks } from '../schema';
import { createStrategy, getStrategy, listStrategies, updateStrategy } from '../strategies';
import { createTestDb, resetDb } from '../testing';
import { recordEntry } from '../trades';

const db = createTestDb();

const strategy = {
  name: '15m BB acceptance',
  description: null,
  rules: [
    { text: 'Accepted above the 15m band', kind: 'edge' },
    { text: 'Risk within my per-trade limit', kind: 'discipline' },
  ],
};

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

describe('strategies', () => {
  it('creates a strategy with its rules in checklist order', async () => {
    const created = await createStrategy(db, strategy);

    expect(created).toMatchObject({ name: '15m BB acceptance' });
    expect(created.rules.map((rule) => [rule.text, rule.kind])).toEqual([
      ['Accepted above the 15m band', 'edge'],
      ['Risk within my per-trade limit', 'discipline'],
    ]);
  });

  it('lists strategies by name, each with its rules', async () => {
    await createStrategy(db, { ...strategy, name: 'Opening range' });
    await createStrategy(db, strategy);

    const list = await listStrategies(db);

    expect(list.map((s) => s.name)).toEqual(['15m BB acceptance', 'Opening range']);
    expect(list[0].rules).toHaveLength(2);
  });

  it('returns null for a strategy that does not exist', async () => {
    expect(await getStrategy(db, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('edits rules in place, adds new ones, and removes the rest', async () => {
    const created = await createStrategy(db, strategy);
    const [accepted] = created.rules;

    const updated = await updateStrategy(db, created.id, {
      name: 'BB acceptance',
      description: 'Trend continuation',
      rules: [
        { text: 'Volume rising with the trend', kind: 'edge' },
        { id: accepted.id, text: 'Accepted outside the 15m band', kind: 'edge' },
      ],
    });

    expect(updated).toMatchObject({ name: 'BB acceptance', description: 'Trend continuation' });
    expect(updated.rules.map((rule) => rule.text)).toEqual([
      'Volume rising with the trend',
      'Accepted outside the 15m band',
    ]);
    expect(updated.rules[1].id).toBe(accepted.id);
  });

  it('returns null when updating a strategy that does not exist', async () => {
    expect(await updateStrategy(db, '00000000-0000-4000-8000-000000000000', strategy)).toBeNull();
  });
});

describe('recordEntry with a checklist', () => {
  it('stores the rule checks with the entry', async () => {
    const created = await createStrategy(db, strategy);
    const [trade] = await db
      .insert(trades)
      .values({ mode: 'paper', symbol: 'SPY', assetClass: 'stock', direction: 'long', quantity: 1, strategyId: created.id })
      .returning();
    const [first, second] = created.rules;

    await recordEntry(db, trade.id, {
      entryPrice: 100,
      openedAt: new Date('2026-10-20T14:00:00Z'),
      ruleChecks: [
        { ruleId: first.id, ruleText: first.text, met: true },
        { ruleId: second.id, ruleText: second.text, met: false },
      ],
    });

    const checks = await db.select().from(tradeRuleChecks);
    expect(checks.map((c) => [c.ruleText, c.met]).sort()).toEqual([
      ['Accepted above the 15m band', true],
      ['Risk within my per-trade limit', false],
    ]);
  });
});
