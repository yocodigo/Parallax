import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getDailyPlan, saveDailyPlan } from '../dailyPlans';
import { dailyPlans } from '../schema';
import { createTestDb, resetDb } from '../testing';

const db = createTestDb();

// The working fib for the day, bullish from 681.2 to 684.5.
const onePlan = {
  tradeDate: '2026-10-28',
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

    expect(saved).toEqual(twoPlan);
    expect(await getDailyPlan(db, '2026-10-28')).toEqual(twoPlan);
  });

  it('leaves the second fib and the notes empty when they are not given', async () => {
    const saved = await saveDailyPlan(db, onePlan);

    expect(saved).toMatchObject({ htfDirection: null, htfFib50: null, htfFib100: null, notes: null });
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

    expect(await getDailyPlan(db, '2026-10-28')).toMatchObject({ ltfDirection: 'bullish' });
    expect(await getDailyPlan(db, '2026-10-29')).toMatchObject({ ltfDirection: 'bearish' });
  });
});

describe('getDailyPlan', () => {
  it('has no plan for a day that was never planned', async () => {
    expect(await getDailyPlan(db, '2026-10-28')).toBeNull();
  });
});
