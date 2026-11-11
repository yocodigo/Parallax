import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { saveDailyPlan } from '@/db/dailyPlans';
import { addJournalEntry } from '@/db/journal';
import { trades } from '@/db/schema';
import { createStrategy } from '@/db/strategies';
import { createTestDb, resetDb } from '@/db/testing';
import { parseReviewRange } from '@/lib/reviewRange';
import { gatherReviewFacts } from '../reviewFacts';

const db = createTestDb();

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

// A closed long option, +$10, filled at 10:00 New York time on the given April day.
const option = (day, overrides) => ({
  mode: 'live',
  symbol: 'SPY',
  assetClass: 'option',
  optionType: 'call',
  strike: 600,
  expiration: '2026-04-30',
  direction: 'long',
  quantity: 1,
  multiplier: 100,
  entryPrice: 1,
  exitPrice: 1.1,
  openedAt: new Date(`2026-04-${day}T14:00:00Z`),
  closedAt: new Date(`2026-04-${day}T15:00:00Z`),
  exitReason: 'target',
  ...overrides,
});

// Tuesday 2026-04-14 noon in New York: the last 7 days are April 8 to 14.
const NOW = new Date('2026-04-14T16:00:00Z');
const week = parseReviewRange({ range: '7d' }, NOW);

describe('gatherReviewFacts', () => {
  it('reads the closed trades of the range, each mode apart, with their plan facts', async () => {
    const strategy = await createStrategy(db, { name: 'Band cross', description: '', rules: [{ kind: 'edge', text: 'Cross on 15m' }] });
    const [inRange] = await db.insert(trades).values(option('13', { strategyId: strategy.id })).returning();
    await db.insert(trades).values(option('14', { mode: 'backtest', exitPrice: 0.9 }));
    // Closed before the range, and still open.
    await db.insert(trades).values(option('07'));
    await db.insert(trades).values(option('13', { exitPrice: null, closedAt: null }));
    await addJournalEntry(db, { kind: 'plan', tradeId: inRange.id, notes: 'Plan.', createdAt: new Date('2026-04-13T13:00:00Z') });

    const facts = await gatherReviewFacts(db, week);

    expect(Object.keys(facts.modes)).toEqual(['live', 'backtest']);
    expect(facts.modes.live.overall.trades).toBe(1);
    expect(facts.modes.backtest.overall.netPnl).toBe(-10);
    expect(facts.trades.map((t) => [t.mode, t.setup])).toEqual([
      ['live', 'Band cross'],
      ['backtest', 'No strategy'],
    ]);
    // The plan entry came before the fill, so Plan OK held for the trade with a strategy.
    expect(facts.modes.live.adherence.checks.plan).toEqual({ ok: 1, missed: 0, cost: 0 });
    expect(facts.range).toEqual({ label: 'Last 7 days', from: '2026-04-08', to: '2026-04-14' });
  });

  it('reads the entries of those trades and the unlinked entries created in range', async () => {
    const [trade] = await db.insert(trades).values(option('13')).returning();
    const [other] = await db.insert(trades).values(option('07')).returning();
    await addJournalEntry(db, { kind: 'review', tradeId: trade.id, notes: 'Linked.', emotion: 'calm', createdAt: new Date('2026-04-13T22:00:00Z') });
    await addJournalEntry(db, { kind: 'review', tradeId: other.id, notes: 'Of a trade out of range.', createdAt: new Date('2026-04-13T22:00:00Z') });
    await addJournalEntry(db, { kind: 'thesis', symbol: 'SPY', notes: 'Unlinked, in range.', createdAt: new Date('2026-04-12T22:00:00Z') });
    await addJournalEntry(db, { kind: 'thesis', symbol: 'SPY', notes: 'Unlinked, before.', createdAt: new Date('2026-04-01T22:00:00Z') });

    const facts = await gatherReviewFacts(db, week);

    expect(facts.journalEntries.map((e) => e.notes)).toEqual(['Unlinked, in range.', 'Linked.']);
    expect(facts.journalEntries[1]).toMatchObject({ ref: 1, emotion: 'calm' });
  });

  it('reads the daily plans of the range and the strategies', async () => {
    await createStrategy(db, { name: 'Band cross', description: '', rules: [{ kind: 'edge', text: 'Cross on 15m' }] });
    await db.insert(trades).values(option('13'));
    await saveDailyPlan(db, { tradeDate: '2026-04-13', ltfDirection: 'bullish', ltfFib50: 101, ltfFib100: 103, notes: 'Plan notes.' });
    await saveDailyPlan(db, { tradeDate: '2026-04-01', ltfDirection: 'bullish', ltfFib50: 90, ltfFib100: 92 });

    const facts = await gatherReviewFacts(db, week);

    expect(facts.dailyPlans.map((p) => [p.date, p.notes])).toEqual([['2026-04-13', 'Plan notes.']]);
    expect(facts.strategies).toEqual([{ name: 'Band cross', rules: [{ kind: 'edge', text: 'Cross on 15m' }] }]);
  });

  it('reads the plan of the day a trade was opened, even when that is before the range', async () => {
    // Opened Monday the 6th, closed Monday the 13th: a swing, in the range by its close.
    await db.insert(trades).values(option('13', { openedAt: new Date('2026-04-06T14:00:00Z') }));
    await saveDailyPlan(db, { tradeDate: '2026-04-06', ltfDirection: 'bullish', ltfFib50: 101, ltfFib100: 103 });
    await saveDailyPlan(db, { tradeDate: '2026-04-01', ltfDirection: 'bullish', ltfFib50: 90, ltfFib100: 92 });

    const facts = await gatherReviewFacts(db, week);

    expect(facts.dailyPlans.map((p) => p.date)).toEqual(['2026-04-06']);
  });

  it('reads every trade for all time', async () => {
    await db.insert(trades).values([option('13'), option('07', { openedAt: new Date('2025-01-07T15:00:00Z'), closedAt: new Date('2025-01-07T16:00:00Z') })]);

    const facts = await gatherReviewFacts(db, parseReviewRange({ range: 'all' }, NOW));

    expect(facts.modes.live.overall.trades).toBe(2);
    expect(facts.range).toEqual({ label: 'All time', from: null, to: null });
  });

  it('has no modes when nothing closed in the range', async () => {
    const facts = await gatherReviewFacts(db, week);

    expect(facts).toMatchObject({ modes: {}, trades: [], journalEntries: [], dailyPlans: [] });
  });
});
