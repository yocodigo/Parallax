import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { count } from 'drizzle-orm';
import * as demo from '@/lib/demoSeed';
import { getDailyPlan } from '../dailyPlans';
import { seedDemo } from '../demoSeed';
import { addJournalEntry, listJournalEntries } from '../journal';
import { journalEntries, tradeRuleChecks, trades } from '../schema';
import { listStrategies } from '../strategies';
import { listClosedTradesWithRuleChecks } from '../trades';
import { createTestDb, resetDb } from '../testing';

const db = createTestDb();

const rows = async (table) => (await db.select({ n: count() }).from(table))[0].n;

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

describe('seedDemo', () => {
  it('saves the demo week through the same functions the app uses', async () => {
    const result = await seedDemo(db, demo);

    expect(result).toEqual({ seeded: true, trades: 8, entries: 13 });
    expect(await rows(trades)).toBe(8);
    expect(await rows(journalEntries)).toBe(8 + demo.DEMO_REVIEWS.length + demo.DEMO_THESES.length);

    const [strategy] = await listStrategies(db);
    expect(strategy.name).toBe('Band cross');
    expect(await getDailyPlan(db, '2026-10-26')).toMatchObject({ ltfFib50: 767.7 });
  });

  it('records fills, exits, and checklist answers, with one plan left unfilled', async () => {
    await seedDemo(db, demo);

    const all = await db.select().from(trades);
    expect(all.filter((trade) => trade.closedAt)).toHaveLength(7);
    expect(all.filter((trade) => !trade.openedAt)).toHaveLength(1);

    // Four strategy trades were entered, each with every rule answered.
    expect(await rows(tradeRuleChecks)).toBe(4 * demo.DEMO_STRATEGY.rules.length);
    const checked = await listClosedTradesWithRuleChecks(db, { mode: 'paper' });
    const nvda = checked.find((trade) => trade.symbol === 'NVDA');
    expect(nvda.ruleChecks.filter((check) => !check.met)).toHaveLength(1);
  });

  it('dates entries when they were written and links reviews with their coaching', async () => {
    await seedDemo(db, demo);

    const entries = await listJournalEntries(db, { limit: 100 });
    const reviews = entries.filter((entry) => entry.kind === 'review');
    expect(reviews).toHaveLength(4);
    for (const review of reviews) {
      expect(review.trade).not.toBeNull();
      expect(review.coaching).toBeTruthy();
      expect(review.coachedAt).toEqual(review.createdAt);
    }
    expect(entries.at(-1).createdAt).toEqual(new Date('2026-10-25T18:00:00Z'));
  });

  it('refuses a database that already has journal entries, and changes nothing', async () => {
    await addJournalEntry(db, { kind: 'review', notes: 'A real note.' });

    expect(await seedDemo(db, demo)).toEqual({ seeded: false, reason: 'not_empty' });
    expect(await rows(trades)).toBe(0);
    expect(await rows(journalEntries)).toBe(1);
  });

  it('refuses to seed twice', async () => {
    await seedDemo(db, demo);

    expect(await seedDemo(db, demo)).toEqual({ seeded: false, reason: 'not_empty' });
    expect(await rows(trades)).toBe(8);
  });
});
