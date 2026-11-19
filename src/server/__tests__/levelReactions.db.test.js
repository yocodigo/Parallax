import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyPlans } from '@/db/schema';
import { createTestDb, resetDb } from '@/db/testing';
import { fetchDailyBarsBetween } from '../dailyBars';
import { fetchMinuteBarsBetween } from '../minuteBars';
import { gatherLevelReactions } from '../levelReactions';

vi.mock('../minuteBars', () => ({ fetchMinuteBarsBetween: vi.fn() }));
vi.mock('../dailyBars', async (importOriginal) => ({ ...(await importOriginal()), fetchDailyBarsBetween: vi.fn() }));

const db = createTestDb();

const clock = (k) => {
  const total = 9 * 60 + 30 + k;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const session = (date, shapes) =>
  shapes.map(([o, h, l, c], k) => ({ t: new Date(`${date}T${clock(k)}:00-04:00`).toISOString(), o, h, l, c, v: 100 }));
const quiet = Array.from({ length: 20 }, (_, k) => (k % 2 ? [98.2, 98.7, 97.7, 98] : [98, 98.5, 97.5, 98.2]));
const REJECTED = [...quiet, [98.1, 100, 98, 99.8], [99.8, 99.9, 99.2, 99.3]];

const NOW = new Date('2026-10-29T15:00:00Z');

beforeEach(async () => {
  await resetDb(db);
  vi.mocked(fetchMinuteBarsBetween).mockReset();
  vi.mocked(fetchDailyBarsBetween).mockReset();
  vi.mocked(fetchMinuteBarsBetween).mockResolvedValue([
    ...session('2026-10-26', quiet),
    ...session('2026-10-27', REJECTED),
    // The day itself is still going: never judged.
    ...session('2026-10-29', REJECTED),
  ]);
  vi.mocked(fetchDailyBarsBetween).mockResolvedValue([{ t: '2026-10-26T04:00:00Z', o: 97, h: 100, l: 97, c: 99, v: 1 }]);
});
afterAll(() => db.$client.end());

describe('gatherLevelReactions', () => {
  it("fetches the year's bars and judges its finished sessions, with the plan of that symbol only", async () => {
    await db.insert(dailyPlans).values([
      { tradeDate: '2026-10-27', symbol: 'SPY', premarketHigh: '100' },
      { tradeDate: '2026-10-27', symbol: 'QQQ', asiaHigh: '100' },
    ]);

    const result = await gatherLevelReactions(db, { symbol: 'SPY', year: 2026, now: NOW });

    expect(result).toMatchObject({ symbol: 'SPY', year: 2026, sessions: 1 });
    expect(result.kinds.map((row) => [row.kind, row.reached, row.rejected])).toEqual([
      ['prior_day_high', 1, 1],
      ['prior_day_low', 0, 0],
      ['premarket_high', 1, 1],
    ]);

    // Five days before January 1 for the first session's ATR, through now; the daily bars from
    // 62 days before, through yesterday.
    expect(fetchMinuteBarsBetween).toHaveBeenCalledWith('SPY', new Date('2025-12-27T05:00:00Z'), NOW);
    expect(fetchDailyBarsBetween).toHaveBeenCalledWith('SPY', '2025-10-31', '2026-10-28');
  });

  it('asks for nothing when the year has not started', async () => {
    const result = await gatherLevelReactions(db, { symbol: 'SPY', year: 2027, now: NOW });

    expect(result).toEqual({ symbol: 'SPY', year: 2027, sessions: 0, kinds: [] });
    expect(fetchMinuteBarsBetween).not.toHaveBeenCalled();
  });
});
