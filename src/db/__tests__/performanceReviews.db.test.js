import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPerformanceReview, savePerformanceReview } from '../performanceReviews';
import { createTestDb, resetDb } from '../testing';

const db = createTestDb();

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

const review = {
  strengths: 'Band cross made money.',
  patternsToFix: 'Oversized twice.',
  ruleAdherence: 'Two lockout entries.',
  emotionalPatterns: 'Frustration came with revenge trades.',
  recommendations: 'Cap size at 2.',
};

const saved = (overrides) => ({
  rangeKey: '7d',
  review,
  tradeCount: 12,
  rangeFrom: '2026-04-07',
  rangeTo: '2026-04-14',
  ...overrides,
});

describe('performance reviews', () => {
  it('has none until one is saved', async () => {
    expect(await getPerformanceReview(db, '7d')).toBeNull();
  });

  it('saves a review under its range and reads it back', async () => {
    await savePerformanceReview(db, saved());

    expect(await getPerformanceReview(db, '7d')).toMatchObject({
      rangeKey: '7d',
      review,
      tradeCount: 12,
      rangeFrom: '2026-04-07',
      rangeTo: '2026-04-14',
    });
    expect((await getPerformanceReview(db, '7d')).reviewedAt).toBeInstanceOf(Date);
  });

  it('keeps one review per range, and a rerun replaces it', async () => {
    await savePerformanceReview(db, saved());
    const first = await getPerformanceReview(db, '7d');
    await savePerformanceReview(db, saved({ review: { ...review, strengths: 'Rerun.' }, tradeCount: 13 }));

    const second = await getPerformanceReview(db, '7d');

    expect(second.review.strengths).toBe('Rerun.');
    expect(second.tradeCount).toBe(13);
    expect(second.reviewedAt.getTime()).toBeGreaterThanOrEqual(first.reviewedAt.getTime());
  });

  it('keeps ranges apart, and an all-time review has no dates', async () => {
    await savePerformanceReview(db, saved());
    await savePerformanceReview(db, saved({ rangeKey: 'all', rangeFrom: null, rangeTo: null, tradeCount: 80 }));

    expect((await getPerformanceReview(db, '7d')).tradeCount).toBe(12);
    expect(await getPerformanceReview(db, 'all')).toMatchObject({ tradeCount: 80, rangeFrom: null, rangeTo: null });
    expect(await getPerformanceReview(db, '30d')).toBeNull();
  });
});
