import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveDailyPlan } from '@/db/dailyPlans';
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

  it('keeps only the named trade of the day, and the history of its mode', async () => {
    const [other] = await db.insert(trades).values(trade({ mode: 'paper' })).returning();
    const [linked] = await db
      .insert(trades)
      .values(trade({ openedAt: new Date('2026-10-29T16:00:00Z'), closedAt: new Date('2026-10-29T17:00:00Z') }))
      .returning();
    await addJournalEntry(db, { kind: 'plan', tradeId: other.id, notes: 'Plan for the other.' });
    await addJournalEntry(db, { kind: 'plan', tradeId: linked.id, notes: 'Plan for the linked.' });
    const fetchBars = vi.fn(async () => []);

    const facts = await gatherCoachingFacts(db, { day: '2026-10-29', tradeId: linked.id, fetchBars });

    expect(facts.trades.map((t) => t.trade.id)).toEqual([linked.id]);
    expect(facts.trades[0].entries.map((e) => e.notes)).toEqual(['Plan for the linked.']);
    // The history is still of the linked trade's mode (live), though the day's first trade was paper.
    expect(facts.whatsWorking.all.trades).toBe(1);
  });

  it('returns null when the named trade was not opened that day', async () => {
    const [yesterday] = await db
      .insert(trades)
      .values(trade({ openedAt: new Date('2026-10-28T14:00:00Z'), closedAt: new Date('2026-10-28T15:00:00Z') }))
      .returning();
    await db.insert(trades).values(trade({}));

    expect(await gatherCoachingFacts(db, { day: '2026-10-29', tradeId: yesterday.id, fetchBars: async () => [] })).toBeNull();
  });

  it("gives each trade the strategy it was planned under and its day's fib plan", async () => {
    const strategy = await createStrategy(db, { name: 'Band cross', description: '', rules: [{ kind: 'edge', text: 'Cross on 15m' }] });
    const [planned] = await db.insert(trades).values(trade({ strategyId: strategy.id })).returning();
    await db.insert(trades).values(trade({ openedAt: new Date('2026-10-29T16:00:00Z'), closedAt: new Date('2026-10-29T17:00:00Z') }));
    const plan = {
      tradeDate: '2026-10-29',
      symbol: 'SPY',
      ltfDirection: 'bullish',
      ltfFib50: 101,
      ltfFib100: 103,
      htfDirection: null,
      htfFib50: null,
      htfFib100: null,
      notes: 'Wait for the 15m cross.',
    };
    await saveDailyPlan(db, plan);

    const facts = await gatherCoachingFacts(db, { day: '2026-10-29', fetchBars: async () => [] });

    expect(facts.trades.map((t) => t.trade.id)[0]).toBe(planned.id);
    expect(facts.trades[0]).toMatchObject({ strategyName: 'Band cross', dailyPlan: plan });
    expect(facts.trades[1]).toMatchObject({ strategyName: null, dailyPlan: plan });
  });

  it('gives a null plan for a day with none recorded', async () => {
    await db.insert(trades).values(trade({}));

    const facts = await gatherCoachingFacts(db, { day: '2026-10-29', fetchBars: async () => [] });

    expect(facts.trades[0].dailyPlan).toBeNull();
  });

  it('reads the history of the first trade’s mode only', async () => {
    await db.insert(trades).values([trade({}), trade({ mode: 'paper', openedAt: new Date('2026-10-28T14:00:00Z'), closedAt: new Date('2026-10-28T15:00:00Z') })]);

    const facts = await gatherCoachingFacts(db, { day: '2026-10-29', fetchBars: async () => [] });

    expect(facts.whatsWorking.all.trades).toBe(1);
  });

  it('counts a fill after 8pm New York time on its own day, not the next UTC date', async () => {
    // 2026-10-29 21:00 in New York is 2026-10-30 01:00Z.
    await db.insert(trades).values(trade({ openedAt: new Date('2026-10-30T01:00:00Z'), closedAt: new Date('2026-10-30T02:00:00Z') }));

    expect(await gatherCoachingFacts(db, { day: '2026-10-30', fetchBars: async () => [] })).toBeNull();
    const facts = await gatherCoachingFacts(db, { day: '2026-10-29', fetchBars: async () => [] });
    expect(facts.trades).toHaveLength(1);
  });

  it('keeps an open trade, with its entry review and nothing from an exit', async () => {
    await db.insert(trades).values(trade({ exitPrice: null, closedAt: null }));

    const facts = await gatherCoachingFacts(db, { day: '2026-10-29', fetchBars: async () => [] });

    expect(facts.trades[0]).toMatchObject({ exitReview: null, giveback: null, stopAdherence: null });
    expect(facts.trades[0].entryReview).toMatchObject({ bias: 'long', setup: null });
    expect(facts.whatsWorking.all.trades).toBe(0);
  });

  it('measures a stock’s giveback on the bars it was open for', async () => {
    await db.insert(trades).values(trade({ exitPrice: 99 }));
    // Before the fill, inside the trade, and after the exit: only the middle one counts.
    const bars = [
      { t: '2026-10-29T13:59:00Z', o: 100, h: 110, l: 100, c: 100, v: 1 },
      { t: '2026-10-29T14:10:00Z', o: 100, h: 103, l: 99.5, c: 101, v: 1 },
      { t: '2026-10-29T15:05:00Z', o: 100, h: 120, l: 99, c: 99, v: 1 },
    ];

    const facts = await gatherCoachingFacts(db, { day: '2026-10-29', fetchBars: async () => bars, fetchDaily: async () => [] });

    // Best open profit 3 on a risk of 2; closed at -0.5R.
    expect(facts.trades[0].giveback).toEqual({ mfeR: 1.5, r: -0.5, givenBackR: 2, flagged: true });
  });

  it("measures an option's giveback on its underlying, from its underlying entry", async () => {
    const option = { assetClass: 'option', optionType: 'call', strike: 100, expiration: '2026-10-30', initialStop: null, entryPrice: 1, exitPrice: 1.5 };
    await db.insert(trades).values(
      trade({ ...option, underlyingEntry: 100, underlyingStop: 98, underlyingStopSource: 'derived', underlyingStopRule: 'band_cross_s2' })
    );
    // Up 3 at best inside the trade; the exit's minute (15:00) averaged 99.
    const bars = [
      { t: '2026-10-29T14:10:00Z', o: 100, h: 103, l: 99.5, c: 101, v: 1, vw: 101 },
      { t: '2026-10-29T15:00:00Z', o: 99.5, h: 99.5, l: 99, c: 99, v: 1, vw: 99 },
    ];

    const facts = await gatherCoachingFacts(db, { day: '2026-10-29', fetchBars: async () => bars, fetchDaily: async () => [] });

    expect(facts.trades[0].giveback).toMatchObject({
      mfe: 3,
      result: -1,
      givenBack: 4,
      mfeR: 1.5,
      r: -0.5,
      givenBackR: 2,
      flagged: true,
      stopSource: 'derived',
    });
  });

  it('gives no giveback for an option with no underlying entry recorded', async () => {
    await db.insert(trades).values(
      trade({ assetClass: 'option', optionType: 'call', strike: 100, expiration: '2026-10-30', initialStop: null, exitPrice: 1.5, entryPrice: 1 })
    );
    const bars = [{ t: '2026-10-29T14:10:00Z', o: 100, h: 103, l: 99.5, c: 101, v: 1, vw: 101 }];

    const facts = await gatherCoachingFacts(db, { day: '2026-10-29', fetchBars: async () => bars, fetchDaily: async () => [] });

    expect(facts.trades[0].giveback).toBeNull();
  });

  it('grades Location OK on the day\'s levels, fetching the daily bars once per symbol and day', async () => {
    // 9:45 breaks the prior day's high of 101 and holds; the 9:53 fill sits
    // just above it.
    const minute = (k, h, l, c, v = 100) => ({
      t: new Date(Date.parse('2026-10-29T13:30:00Z') + k * 60_000).toISOString(),
      o: c,
      h,
      l,
      c,
      v,
    });
    const bars = [
      ...Array.from({ length: 15 }, (_, k) => minute(k, 100.7, 100.3, 100.5)),
      minute(15, 101.4, 100.6, 101.3, 200),
      minute(16, 101.5, 101.2, 101.4),
      minute(17, 101.4, 101.1, 101.3),
      ...Array.from({ length: 5 }, (_, k) => minute(18 + k, 101.2, 101.0, 101.1)),
    ];
    const fill = { openedAt: new Date('2026-10-29T13:53:00Z'), entryPrice: 101.1, initialStop: 100.5 };
    await db.insert(trades).values([trade(fill), trade({ ...fill, closedAt: new Date('2026-10-29T15:05:00Z') })]);
    const fetchDaily = vi.fn(async () => [{ t: '2026-10-28T04:00:00Z', o: 99, h: 101, l: 98, c: 100, v: 1000 }]);

    const facts = await gatherCoachingFacts(db, { day: '2026-10-29', fetchBars: async () => bars, fetchDaily });

    expect(fetchDaily).toHaveBeenCalledTimes(1);
    expect(fetchDaily).toHaveBeenCalledWith('SPY', '2026-10-29');
    expect(facts.whatsWorking.gates).toContainEqual(expect.objectContaining({ gate: 'location', met: expect.objectContaining({ trades: 2 }) }));
  });

  it("grades the Setup gate for a strategy's detector, leaving Direction and Entry to the band cross", async () => {
    const minute = (k, h, l, c, v = 100) => ({
      t: new Date(Date.parse('2026-10-29T13:30:00Z') + k * 60_000).toISOString(),
      o: c,
      h,
      l,
      c,
      v,
    });
    // The Location test's morning: its last 5m bar meets Entry OK.
    const bars = [
      ...Array.from({ length: 15 }, (_, k) => minute(k, 100.7, 100.3, 100.5)),
      minute(15, 101.4, 100.6, 101.3, 200),
      minute(16, 101.5, 101.2, 101.4),
      minute(17, 101.4, 101.1, 101.3),
      ...Array.from({ length: 5 }, (_, k) => minute(18 + k, 101.2, 101.0, 101.1)),
    ];
    const strategy = (detector) =>
      createStrategy(db, { name: detector ?? 'Checklist', detector, rules: [{ kind: 'edge', text: 'A rule' }] });
    const gatesWith = async (detector, fetchBars = async () => bars) => {
      await resetDb(db);
      const { id } = await strategy(detector);
      await db.insert(trades).values(trade({ openedAt: new Date('2026-10-29T13:53:00Z'), entryPrice: 101.1, strategyId: id }));
      const facts = await gatherCoachingFacts(db, { day: '2026-10-29', fetchBars, fetchDaily: async () => [] });
      return facts.whatsWorking.gates.map((g) => g.gate);
    };

    expect(await gatesWith(null)).toContain('entry');
    expect(await gatesWith('band_cross')).toContain('entry');
    // No four-touch line formed, so its Setup gate is missed and no Entry is judged.
    expect(await gatesWith('four_touch')).not.toContain('entry');
  });

  it('judges stop adherence per trade and over the recent history', async () => {
    const stopped = (k) =>
      trade({
        stopRule: 'S2',
        exitReason: 'invalidation',
        openedAt: new Date(Date.UTC(2026, 9, 20 + k, 14)),
        closedAt: new Date(Date.UTC(2026, 9, 20 + k, 15)),
      });
    await db.insert(trades).values([0, 1, 2, 3].map(stopped));
    await db.insert(trades).values(stopped(9));

    const facts = await gatherCoachingFacts(db, { day: '2026-10-29', fetchBars: async () => [] });

    expect(facts.trades[0].stopAdherence).toEqual({ result: 'adherent', reason: 'invalidation' });
    expect(facts.stopAdherence).toEqual({ rate: 1, adherent: 5, misses: 0, trades: 5 });
    expect(facts.whatsWorking.all).toMatchObject({ trades: 5, r: { trades: 5, average: 1 } });
  });
});
