import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BREAKER_SETTINGS } from '@/lib/circuitBreakerSettings';
import { DEFAULT_RECORDING_PROMPTS } from '@/lib/recordingPrompts';
import { getBreakerSettings, getRecordingPrompts, saveBreakerSettings, saveRecordingPrompts } from '../settings';
import { createTestDb, resetDb } from '../testing';

const db = createTestDb();

const settings = {
  maxDailyLossR: 3,
  maxTradesPerDay: 5,
  cooldownAfterLosses: 3,
  cooldownMinutes: 60,
  maxDailyLossOptionsDollars: 30,
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

describe('recording prompts', () => {
  const prompts = {
    preTradePrompt: 'Direction, setup, stop, target.',
    endOfDayPrompt: 'How did it go?',
    micTips: 'Quiet room.',
  };

  it('are the defaults before anything is saved', async () => {
    expect(await getRecordingPrompts(db)).toEqual(DEFAULT_RECORDING_PROMPTS);
  });

  it('saves and reads back the prompts', async () => {
    expect(await saveRecordingPrompts(db, prompts)).toEqual(prompts);
    expect(await getRecordingPrompts(db)).toEqual(prompts);
  });

  it('replaces the saved prompts on a second save', async () => {
    await saveRecordingPrompts(db, prompts);
    const updated = { ...prompts, micTips: 'Say the ticker first.' };
    await saveRecordingPrompts(db, updated);

    expect(await getRecordingPrompts(db)).toEqual(updated);
  });
});
