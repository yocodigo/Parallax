import { count } from 'drizzle-orm';
import { saveDailyPlan } from './dailyPlans';
import { addJournalEntry, savePlan } from './journal';
import { journalEntries, trades } from './schema';
import { createStrategy } from './strategies';
import { recordEntry, recordExit } from './trades';

// Fills an empty database with the demo week (src/lib/demoSeed.js), through
// the same repository functions the app uses. It only ever adds: a database
// with any trade or journal entry is refused untouched, so pointing it at a
// real journal by mistake does nothing. To reseed, start from a fresh database.
// One transaction, so a failure leaves nothing half-seeded.
export async function seedDemo(
  db,
  { DEMO_STRATEGY, DEMO_TRADES, DEMO_REVIEWS, DEMO_THESES, DEMO_DAILY_PLANS }
) {
  return db.transaction(async (tx) => {
    const [{ n: tradeRows }] = await tx.select({ n: count() }).from(trades);
    const [{ n: entryRows }] = await tx.select({ n: count() }).from(journalEntries);
    if (tradeRows > 0 || entryRows > 0) return { seeded: false, reason: 'not_empty' };

    const strategy = await createStrategy(tx, DEMO_STRATEGY);
    const tradeIds = [];
    for (const { plan, followsStrategy, planEntry, entry, exit } of DEMO_TRADES) {
      const { trade } = await savePlan(tx, {
        plan: { ...plan, strategyId: followsStrategy ? strategy.id : null, createdAt: planEntry.createdAt },
        entry: planEntry,
      });
      tradeIds.push(trade.id);
      if (!entry) continue;

      const ruleChecks = followsStrategy
        ? strategy.rules.map((rule, index) => ({
            ruleId: rule.id,
            ruleText: rule.text,
            met: !entry.unmetRules.includes(index),
          }))
        : [];
      await recordEntry(tx, trade.id, { entryPrice: entry.entryPrice, openedAt: entry.openedAt, ruleChecks });
      if (exit) await recordExit(tx, trade.id, exit);
    }

    for (const { tradeIndex, createdAt, ...review } of DEMO_REVIEWS) {
      await addJournalEntry(tx, { ...review, kind: 'review', tradeId: tradeIds[tradeIndex], coachedAt: createdAt, createdAt });
    }
    for (const thesis of DEMO_THESES) await addJournalEntry(tx, { ...thesis, kind: 'thesis' });
    for (const dailyPlan of DEMO_DAILY_PLANS) await saveDailyPlan(tx, dailyPlan);

    return {
      seeded: true,
      trades: tradeIds.length,
      entries: DEMO_TRADES.length + DEMO_REVIEWS.length + DEMO_THESES.length,
    };
  });
}
