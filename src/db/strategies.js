import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import { strategies, strategyRules } from './schema';

async function rulesOf(db, strategyIds) {
  if (strategyIds.length === 0) return [];
  return db
    .select()
    .from(strategyRules)
    .where(inArray(strategyRules.strategyId, strategyIds))
    .orderBy(asc(strategyRules.position));
}

const withRules = (strategy, rules) => ({
  ...strategy,
  rules: rules.filter((rule) => rule.strategyId === strategy.id),
});

// Every strategy, by name, each with its rules in checklist order.
export async function listStrategies(db) {
  const rows = await db.select().from(strategies).orderBy(asc(strategies.name));
  const rules = await rulesOf(db, rows.map((row) => row.id));
  return rows.map((row) => withRules(row, rules));
}

export async function getStrategy(db, id) {
  const [row] = await db.select().from(strategies).where(eq(strategies.id, id));
  return row ? withRules(row, await rulesOf(db, [row.id])) : null;
}

export async function createStrategy(db, { name, description, rules }) {
  const id = await db.transaction(async (tx) => {
    const [strategy] = await tx.insert(strategies).values({ name, description }).returning();
    await tx
      .insert(strategyRules)
      .values(rules.map((rule, position) => ({ strategyId: strategy.id, text: rule.text, kind: rule.kind, position })));
    return strategy.id;
  });
  return getStrategy(db, id);
}

// Replaces the strategy's name, description, and checklist. A rule sent with
// its id is edited in place, so the trades checked against it stay linked;
// rules without one are added, and rules left out are removed. Null if there
// is no such strategy.
export async function updateStrategy(db, id, { name, description, rules }) {
  const found = await db.transaction(async (tx) => {
    const [strategy] = await tx
      .update(strategies)
      .set({ name, description })
      .where(eq(strategies.id, id))
      .returning();
    if (!strategy) return false;

    const existing = new Set((await rulesOf(tx, [id])).map((rule) => rule.id));
    const kept = [];
    for (const [position, rule] of rules.entries()) {
      const values = { text: rule.text, kind: rule.kind, position };
      if (rule.id && existing.has(rule.id)) {
        await tx.update(strategyRules).set(values).where(eq(strategyRules.id, rule.id));
        kept.push(rule.id);
      } else {
        const [added] = await tx.insert(strategyRules).values({ ...values, strategyId: id }).returning();
        kept.push(added.id);
      }
    }
    await tx
      .delete(strategyRules)
      .where(and(eq(strategyRules.strategyId, id), notInArray(strategyRules.id, kept)));
    return true;
  });
  return found ? getStrategy(db, id) : null;
}
