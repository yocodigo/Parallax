import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyPlans, journalEntries, trades } from '@/db/schema';
import { createTestDb, resetDb } from '@/db/testing';
import { gatherPlansNotTaken } from '../plansNotTaken';

const db = createTestDb();

// Tuesday 2026-10-27, on Eastern Daylight Time.
const at = (hhmm, day = '2026-10-27') => new Date(`${day}T${hhmm}:00-04:00`);
const minute = (hhmm, o, h, l, c) => ({ t: at(hhmm).toISOString(), o, h, l, c, v: 10 });

const optionPlan = {
  mode: 'paper',
  symbol: 'SPY',
  assetClass: 'option',
  optionType: 'call',
  strike: 580,
  expiration: '2026-10-27',
  direction: 'long',
  quantity: 2,
  multiplier: 100,
  plannedEntry: 2,
};

async function planned(values, writtenAt = at('10:00')) {
  const [trade] = await db.insert(trades).values({ ...optionPlan, ...values }).returning();
  await db.insert(journalEntries).values({ kind: 'plan', notes: 'n', tradeId: trade.id, createdAt: writtenAt });
  return trade;
}

// The contract trades at 2.00 at 10:03 and is up to 2.60 by 10:10; the underlying is 580.00 at the fill.
const CONTRACT = [minute('10:03', 2.2, 2.3, 1.95, 2.1), minute('10:10', 2.4, 2.7, 2.4, 2.6)];
const UNDERLYING = [minute('10:03', 580, 580.2, 579.8, 580), minute('10:10', 580.4, 580.7, 580.4, 580.6)];

const RANGE = { mode: 'paper', from: new Date('2026-01-01T05:00:00Z'), to: new Date('2027-01-01T05:00:00Z'), now: new Date('2026-10-28T15:00:00Z') };

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

describe('gatherPlansNotTaken', () => {
  it("replays each plan that was never filled on its day's bars, with the median fees of the trades taken", async () => {
    const hit = await planned({});
    await planned({ plannedEntry: 1.2 }); // never reached
    // Two trades taken in the range, fees 1.00 and 3.00: the median is 2.00.
    for (const fees of [1, 3]) {
      await db.insert(trades).values({ ...optionPlan, entryPrice: 2, exitPrice: 2, fees, openedAt: at('11:00'), closedAt: at('11:30') });
    }
    await db.insert(dailyPlans).values({ tradeDate: '2026-10-27', symbol: 'SPY', ltfDirection: 'bullish', ltfFib50: '580.5', ltfFib100: '581' });
    const fetchBars = vi.fn().mockResolvedValue(UNDERLYING);
    const fetchContractBars = vi.fn().mockResolvedValue(CONTRACT);

    const result = await gatherPlansNotTaken(db, { ...RANGE, fetchBars, fetchContractBars });

    expect(result).toMatchObject({ plans: 2, neverTriggered: 1, replayed: 1, fees: 2, feesTrades: 2 });
    const row = result.rows.find((r) => r.tradeId === hit.id);
    // In at 2.00 at 10:03, T1 (the fib's 50%, 580.50) reached at 10:10, sold at that minute's close.
    expect(row).toMatchObject({ outcome: 'replayed', entryPrice: 2, exitPrice: 2.6, exitReason: 't1', quantity: 2, multiplier: 100 });
    // (2.60 - 2.00) * 100 * 2 = 120.00 gross, less 2.00 of fees.
    expect(result.summary).toMatchObject({ trades: 1, grossPnl: 120, netPnl: 118 });
    // The underlying's day once, the contract's own bars.
    expect(fetchBars).toHaveBeenCalledTimes(1);
    expect(fetchContractBars).toHaveBeenCalledWith('SPY261027C00580000', at('10:00'), expect.any(Date));
  });

  it("leaves out today's plans, whose day isn't over, and other modes", async () => {
    await planned({}, at('10:00', '2026-10-28'));
    await planned({ mode: 'live' });
    const fetchBars = vi.fn();
    const fetchContractBars = vi.fn();

    const result = await gatherPlansNotTaken(db, { ...RANGE, fetchBars, fetchContractBars });

    expect(result).toMatchObject({ plans: 0, replayed: 0, rows: [] });
    expect(fetchContractBars).not.toHaveBeenCalled();
  });

  it('assumes no fees when no option trade was taken, and says so', async () => {
    await planned({});

    const result = await gatherPlansNotTaken(db, {
      ...RANGE,
      fetchBars: async () => UNDERLYING,
      fetchContractBars: async () => CONTRACT,
    });

    expect(result).toMatchObject({ fees: 0, feesTrades: 0 });
  });
});
