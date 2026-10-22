import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BREAKER_SETTINGS } from '@/lib/circuitBreakerSettings';
import { getBreakerSettings, saveBreakerSettings } from '../settings';
import { createTestDb, resetDb } from '../testing';

const db = createTestDb();

const settings = {
  maxDailyLossR: 3,
  maxTradesPerDay: 5,
  cooldownAfterLosses: 3,
  cooldownMinutes: 60,
  modes: ['live', 'paper'],
};

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

describe('circuit breaker settings', () => {
  it('are the defaults before anything is saved', async () => {
    expect(await getBreakerSettings(db)).toEqual(DEFAULT_BREAKER_SETTINGS);
  });

  it('saves and reads back the limits', async () => {
    expect(await saveBreakerSettings(db, settings)).toEqual(settings);
    expect(await getBreakerSettings(db)).toEqual(settings);
  });

  it('replaces the saved limits on a second save', async () => {
    await saveBreakerSettings(db, settings);
    await saveBreakerSettings(db, { ...DEFAULT_BREAKER_SETTINGS, maxTradesPerDay: 2 });

    expect(await getBreakerSettings(db)).toEqual({ ...DEFAULT_BREAKER_SETTINGS, maxTradesPerDay: 2 });
  });
});
