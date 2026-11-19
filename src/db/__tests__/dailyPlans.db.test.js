import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getDailyPlan, listDailyPlansBetween, saveDailyPlan } from '../dailyPlans';
import { dailyPlans } from '../schema';
import { createTestDb, resetDb } from '../testing';

const db = createTestDb();

// The working fib for the day, bullish from 681.2 to 684.5.
const onePlan = {
  tradeDate: '2026-10-28',
  symbol: 'SPY',
  ltfDirection: 'bullish',
  ltfFib50: 681.2,
  ltfFib100: 684.5,
};

const twoPlan = {
  ...onePlan,
  htfDirection: 'bullish',
  htfFib50: 686,
  htfFib100: 691.4,
  notes: 'gap up into the HTF 50%',
};

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

describe('saveDailyPlan', () => {
  it("saves the day's fibs and reads them back by date", async () => {
    const saved = await saveDailyPlan(db, twoPlan);

    // The overnight levels, left blank, come back as null.
    const read = { ...twoPlan, asiaHigh: null, asiaLow: null, londonHigh: null, londonLow: null, premarketHigh: null, premarketLow: null };
    expect(saved).toEqual(read);
    expect(await getDailyPlan(db, '2026-10-28', 'SPY')).toEqual(read);
  });

  it('leaves the second fib and the notes empty when they are not given', async () => {
    const saved = await saveDailyPlan(db, onePlan);

    expect(saved).toMatchObject({ htfDirection: null, htfFib50: null, htfFib100: null, notes: null });
  });

  it('saves a plan with no fib yet, the fields read back as null', async () => {
    const saved = await saveDailyPlan(db, { tradeDate: '2026-10-28', symbol: 'SPY', notes: 'before the open' });

    expect(saved).toMatchObject({ ltfDirection: null, ltfFib50: null, ltfFib100: null, notes: 'before the open' });
  });

  it('clears the working fib when the day is saved again without one', async () => {
    await saveDailyPlan(db, onePlan);

    const saved = await saveDailyPlan(db, { tradeDate: '2026-10-28', symbol: 'SPY' });

    expect(saved).toMatchObject({ ltfDirection: null, ltfFib50: null, ltfFib100: null });
  });

  it('saves the overnight highs and lows, a blank one read back as null', async () => {
    const overnight = { asiaHigh: 683.1, asiaLow: 679.4, londonHigh: 684, londonLow: 680.5, premarketHigh: 683.75 };

    const saved = await saveDailyPlan(db, { ...onePlan, ...overnight });

    expect(saved).toMatchObject({ ...overnight, premarketLow: null });
    expect(await getDailyPlan(db, '2026-10-28', 'SPY')).toMatchObject({ ...overnight, premarketLow: null });
  });

  it.each(['asia', 'london', 'premarket'])('refuses a %s high below its low', async (session) => {
    const plan = { tradeDate: '2026-10-28', symbol: 'SPY', [`${session}High`]: 679, [`${session}Low`]: 680 };
    await expect(saveDailyPlan(db, plan)).rejects.toThrow();
  });

  it('refuses half a working fib', async () => {
    await expect(saveDailyPlan(db, { tradeDate: '2026-10-28', symbol: 'SPY', ltfFib50: 681.2 })).rejects.toThrow();
  });

  it('replaces the plan when the same day is saved again', async () => {
    await saveDailyPlan(db, twoPlan);

    // Re-anchored after the open, and the second fib dropped.
    const saved = await saveDailyPlan(db, { ...onePlan, ltfFib50: 682, ltfFib100: 685.1 });

    expect(saved).toMatchObject({ ltfFib50: 682, htfFib50: null, notes: null });
    expect(await db.select().from(dailyPlans)).toHaveLength(1);
  });

  it('keeps each day its own plan', async () => {
    await saveDailyPlan(db, onePlan);
    await saveDailyPlan(db, { ...onePlan, tradeDate: '2026-10-29', ltfDirection: 'bearish', ltfFib100: 677.5 });

    expect(await getDailyPlan(db, '2026-10-28', 'SPY')).toMatchObject({ ltfDirection: 'bullish' });
    expect(await getDailyPlan(db, '2026-10-29', 'SPY')).toMatchObject({ ltfDirection: 'bearish' });
  });

  it("keeps each symbol its own plan on the same day", async () => {
    await saveDailyPlan(db, onePlan);
    await saveDailyPlan(db, { ...onePlan, symbol: 'QQQ', ltfDirection: 'bearish', ltfFib50: 610, ltfFib100: 605 });

    expect(await getDailyPlan(db, '2026-10-28', 'SPY')).toMatchObject({ symbol: 'SPY', ltfFib50: 681.2 });
    expect(await getDailyPlan(db, '2026-10-28', 'QQQ')).toMatchObject({ symbol: 'QQQ', ltfFib50: 610 });
  });
});

describe('getDailyPlan', () => {
  it('has no plan for a day that was never planned', async () => {
    expect(await getDailyPlan(db, '2026-10-28', 'SPY')).toBeNull();
  });

  it("never answers with another symbol's plan for the day", async () => {
    await saveDailyPlan(db, onePlan);

    expect(await getDailyPlan(db, '2026-10-28', 'MSFT')).toBeNull();
  });
});

describe('listDailyPlansBetween', () => {
  beforeEach(async () => {
    for (const tradeDate of ['2026-10-27', '2026-10-28', '2026-10-29']) await saveDailyPlan(db, { ...onePlan, tradeDate });
  });

  it('lists the plans of the days in range, both ends included, oldest first', async () => {
    const plans = await listDailyPlansBetween(db, { fromDay: '2026-10-28', toDay: '2026-10-29' });

    expect(plans.map((plan) => plan.tradeDate)).toEqual(['2026-10-28', '2026-10-29']);
    expect(plans[0]).toMatchObject({ ltfDirection: 'bullish', ltfFib50: 681.2, htfDirection: null, notes: null });
  });

  it('leaves a side open when its day is null, and lists every plan with both null', async () => {
    expect((await listDailyPlansBetween(db, { fromDay: '2026-10-29', toDay: null })).map((p) => p.tradeDate)).toEqual(['2026-10-29']);
    expect((await listDailyPlansBetween(db, { fromDay: null, toDay: '2026-10-27' })).map((p) => p.tradeDate)).toEqual(['2026-10-27']);
    expect(await listDailyPlansBetween(db, { fromDay: null, toDay: null })).toHaveLength(3);
  });
});
