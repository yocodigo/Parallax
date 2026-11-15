import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveTradeContext } from '@/db/contexts';
import { dailyPlans, trades } from '@/db/schema';
import { createTestDb, resetDb } from '@/db/testing';
import { gatherOptionExcursions } from '../optionExcursions';

const db = createTestDb();

const minute = (hhmm, l, h, vw = (l + h) / 2) => ({ t: `2026-11-04T${hhmm}:00Z`, o: l, h, l, c: h, v: 1, vw });

// Two bought SPY calls on Nov 4, 2026, each 580.00 on the underlying at the
// fill with a derived stop at 579.00 (1R is a point).
const call = (overrides) => ({
  mode: 'live',
  symbol: 'SPY',
  assetClass: 'option',
  optionType: 'call',
  strike: 580,
  expiration: '2026-11-04',
  direction: 'long',
  quantity: 1,
  multiplier: 100,
  plannedEntry: 2,
  entryPrice: 2,
  underlyingEntry: 580,
  underlyingStop: 579,
  underlyingStopSource: 'derived',
  underlyingStopRule: 'band_cross_s2',
  ...overrides,
});

// The underlying: 580.00 before the winner's fill (the exit review's price at
// the fill), down to 579.40 inside it (15:16), its exit minute (15:20) at
// 580.80, then up to 581.50 at 15:25.
const SPY_BARS = [
  minute('15:14', 579.9, 580),
  minute('15:15', 579.9, 580.1),
  minute('15:16', 579.4, 580),
  minute('15:18', 580, 580.6),
  minute('15:20', 580.6, 581, 580.8),
  minute('15:25', 581, 581.5),
  minute('15:40', 579, 579.5, 579.2),
  minute('15:42', 578.8, 579.3),
];

// The winner's contract: as low as 1.70 while open.
const CONTRACT_BARS = [minute('15:15', 1.9, 2.05), minute('15:16', 1.7, 1.95), minute('15:20', 2.3, 2.45)];

async function insert(values) {
  const [trade] = await db.insert(trades).values(values).returning();
  return trade;
}

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

describe('gatherOptionExcursions', () => {
  it("measures each winner's heat on its contract's bars and every exit's after-the-exit on the underlying", async () => {
    const winner = await insert(
      call({ exitPrice: 2.4, openedAt: new Date('2026-11-04T15:15:30Z'), closedAt: new Date('2026-11-04T15:20:40Z') })
    );
    const loser = await insert(
      call({ exitPrice: 1.6, openedAt: new Date('2026-11-04T15:38:00Z'), closedAt: new Date('2026-11-04T15:40:20Z') })
    );
    await db.insert(dailyPlans).values({ tradeDate: '2026-11-04', ltfDirection: 'bullish', ltfFib50: 581.2, ltfFib100: 582 });
    const fetchBars = vi.fn(async () => SPY_BARS);
    const fetchContractBars = vi.fn(async () => CONTRACT_BARS);

    const result = await gatherOptionExcursions(db, {
      mode: 'live',
      from: new Date('2026-01-01T05:00:00Z'),
      to: new Date('2027-01-01T05:00:00Z'),
      now: new Date('2026-11-05T00:00:00Z'),
      fetchBars,
      fetchContractBars,
    });

    // One underlying fetch for the symbol and day, reaching 16 minutes past the
    // day's last exit minute (15:40).
    expect(fetchBars).toHaveBeenCalledTimes(1);
    expect(fetchBars).toHaveBeenCalledWith('SPY', new Date('2026-11-04T15:56:00Z'));
    // Contract bars for the winner only, from its fill's minute through its exit's.
    expect(fetchContractBars).toHaveBeenCalledTimes(1);
    expect(fetchContractBars).toHaveBeenCalledWith('SPY261104C00580000', new Date('2026-11-04T15:15:00Z'), new Date('2026-11-04T15:21:00Z'));

    const [heat] = result.heat.rows;
    expect(heat).toMatchObject({ tradeId: winner.id, contract: 'SPY261104C00580000', premium: { source: 'bars' } });
    expect(heat.premium.perShare).toBeCloseTo(0.3);
    // 15:15 to 15:20 is six minutes, three with a bar.
    expect(heat.premium.barCoverage).toBeCloseTo(0.5);
    expect(heat.underlying.mae).toBeCloseTo(0.6);
    expect(heat.underlying.maeR).toBeCloseTo(0.6);
    expect(result.heat.summary.premium.excluded.partialCoverage).toBe(1);
    expect(result.heat.summaryAll.premium.trades).toBe(1);

    // After the winner's exit (580.80): up to 581.50, through T1 at 581.20.
    const after = result.afterExit.rows.find((row) => row.tradeId === winner.id);
    expect(after).toMatchObject({ t1: 581.2, t1Reached: true });
    expect(after.ranFor).toBeCloseTo(0.7);
    expect(result.afterExit.rows.map((row) => row.tradeId)).toContain(loser.id);
    expect(result.afterExit.summary.trades).toBe(2);
  });

  it("falls back to the delta the winner's context kept when its contract had no bars", async () => {
    const winner = await insert(
      call({ exitPrice: 2.4, openedAt: new Date('2026-11-04T15:15:30Z'), closedAt: new Date('2026-11-04T15:20:40Z') })
    );
    await saveTradeContext(db, winner.id, { version: 2, option: { delta: 0.5 } });

    const result = await gatherOptionExcursions(db, {
      mode: 'live',
      now: new Date('2026-11-05T00:00:00Z'),
      fetchBars: async () => SPY_BARS,
      fetchContractBars: async () => [],
    });

    const [heat] = result.heat.rows;
    expect(heat.premium.source).toBe('delta');
    // Half of the underlying's 0.60 against it.
    expect(heat.premium.perShare).toBeCloseTo(0.3);
  });

  it('leaves out the trades of other modes', async () => {
    await insert(call({ mode: 'paper', exitPrice: 2.4, openedAt: new Date('2026-11-04T15:15:30Z'), closedAt: new Date('2026-11-04T15:20:40Z') }));
    const fetchBars = vi.fn(async () => SPY_BARS);

    const result = await gatherOptionExcursions(db, { mode: 'live', fetchBars, fetchContractBars: async () => [] });

    expect(fetchBars).not.toHaveBeenCalled();
    expect(result.heat.rows).toEqual([]);
    expect(result.afterExit.summary.trades).toBe(0);
  });

  it('fails the whole call when a fetch fails', async () => {
    await insert(call({ exitPrice: 2.4, openedAt: new Date('2026-11-04T15:15:30Z'), closedAt: new Date('2026-11-04T15:20:40Z') }));

    await expect(
      gatherOptionExcursions(db, {
        mode: 'live',
        fetchBars: async () => {
          throw new Error('403 from Alpaca');
        },
      })
    ).rejects.toThrow('403 from Alpaca');
  });
});
