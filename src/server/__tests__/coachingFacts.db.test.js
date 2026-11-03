import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addJournalEntry } from '@/db/journal';
import { trades } from '@/db/schema';
import { createStrategy } from '@/db/strategies';
import { createTestDb, resetDb } from '@/db/testing';
import { gatherCoachingFacts } from '../coachingFacts';

const db = createTestDb();

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

const trade = (overrides) => ({
  mode: 'live',
  symbol: 'SPY',
  assetClass: 'stock',
  direction: 'long',
  quantity: 10,
  plannedEntry: 100,
  initialStop: 98,
  entryPrice: 100,
  openedAt: new Date('2026-10-29T14:00:00Z'),
  exitPrice: 102,
  closedAt: new Date('2026-10-29T15:00:00Z'),
  ...overrides,
});

describe('gatherCoachingFacts', () => {
  it('returns null when no trade was opened that New York day', async () => {
    await db.insert(trades).values(trade({ openedAt: new Date('2026-10-28T14:00:00Z'), closedAt: new Date('2026-10-28T15:00:00Z') }));
    const fetchBars = vi.fn(async () => []);

    expect(await gatherCoachingFacts(db, { day: '2026-10-29', fetchBars })).toBeNull();
    expect(fetchBars).not.toHaveBeenCalled();
  });

  it("collects the day's trades in the order opened, with their entries and the history", async () => {
    const [yesterday] = await db
      .insert(trades)
      .values(trade({ openedAt: new Date('2026-10-28T14:00:00Z'), closedAt: new Date('2026-10-28T15:00:00Z'), exitPrice: 99 }))
      .returning();
    const [later] = await db
      .insert(trades)
      .values(trade({ openedAt: new Date('2026-10-29T16:00:00Z'), closedAt: new Date('2026-10-29T17:00:00Z'), exitPrice: 99 }))
      .returning();
    const [earlier] = await db.insert(trades).values(trade({})).returning();
    await addJournalEntry(db, { kind: 'plan', tradeId: earlier.id, notes: 'Plan for the first.' });
    await addJournalEntry(db, { kind: 'review', tradeId: yesterday.id, notes: 'Held too long.', mistakes: ['held_past_stop'] });
    await createStrategy(db, { name: 'Band cross', description: '', rules: [{ kind: 'edge', text: 'Cross on 15m' }] });
    const fetchBars = vi.fn(async () => []);

    const facts = await gatherCoachingFacts(db, { day: '2026-10-29', fetchBars, now: new Date('2026-10-30T00:00:00Z') });

    expect(facts.day).toBe('2026-10-29');
    expect(facts.trades.map((t) => t.trade.id)).toEqual([earlier.id, later.id]);
    expect(facts.trades[0].entries.map((e) => e.notes)).toEqual(['Plan for the first.']);
    expect(facts.trades[0]).toHaveProperty('entryReview');
    expect(facts.trades[0]).toHaveProperty('exitReview');
    // No bars, so there is nothing to measure a giveback from.
    expect(facts.trades[0].giveback).toBeNull();
    // One fetch for the day's two SPY trades, one for yesterday's, which the history replays.
    expect(fetchBars).toHaveBeenCalledTimes(2);
    expect(fetchBars.mock.calls.map(([symbol]) => symbol)).toEqual(['SPY', 'SPY']);

    // The history takes in all three closed trades, other days included.
    expect(facts.whatsWorking.all.trades).toBe(3);
    expect(facts.mistakeLedger.mistakes.map((m) => m.mistake)).toEqual(['held_past_stop']);
    expect(facts.strategies).toEqual([{ name: 'Band cross', rules: [{ kind: 'edge', text: 'Cross on 15m' }] }]);
    // Fewer than 5 judged trades.
    expect(facts.stopAdherence).toBeNull();
  });

  it('reads the history of the first trade’s mode only', async () => {
    await db.insert(trades).values([trade({}), trade({ mode: 'paper', openedAt: new Date('2026-10-28T14:00:00Z'), closedAt: new Date('2026-10-28T15:00:00Z') })]);

    const facts = await gatherCoachingFacts(db, { day: '2026-10-29', fetchBars: async () => [] });

    expect(facts.whatsWorking.all.trades).toBe(1);
  });
});
