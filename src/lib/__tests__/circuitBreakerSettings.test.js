import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DEFAULT_BREAKER_SETTINGS, parseBreakerSettings } from '../circuitBreakerSettings';

const errorsOf = (result) => z.flattenError(result.error).fieldErrors;

const settings = {
  maxDailyLossR: 3,
  maxTradesPerDay: 5,
  cooldownAfterLosses: 3,
  cooldownMinutes: 60,
  modes: ['live'],
};

describe('parseBreakerSettings', () => {
  it('accepts a full set of limits', () => {
    expect(parseBreakerSettings(settings)).toEqual({ success: true, data: settings });
  });

  it('turns a limit left out into null, which means off', () => {
    const result = parseBreakerSettings({ modes: ['live', 'paper'] });

    expect(result.data).toEqual({ ...DEFAULT_BREAKER_SETTINGS, modes: ['live', 'paper'] });
  });

  it('requires limits above zero, and whole numbers for counts and minutes', () => {
    const result = parseBreakerSettings({ ...settings, maxDailyLossR: 0, maxTradesPerDay: 2.5, cooldownMinutes: -5 });

    expect(Object.keys(errorsOf(result)).sort()).toEqual(['cooldownMinutes', 'maxDailyLossR', 'maxTradesPerDay']);
  });

  it('needs both halves of the cool-down, or neither', () => {
    const result = parseBreakerSettings({ ...settings, cooldownMinutes: null });

    expect(errorsOf(result).cooldownMinutes).toEqual(['Set how long the cool-down lasts']);
  });

  it('needs at least one mode, each listed once', () => {
    expect(errorsOf(parseBreakerSettings({ ...settings, modes: [] }))).toHaveProperty('modes');
    expect(parseBreakerSettings({ ...settings, modes: ['live', 'live'] }).data.modes).toEqual(['live']);
  });
});

describe('DEFAULT_BREAKER_SETTINGS', () => {
  it('has every limit off and counts live trades', () => {
    expect(DEFAULT_BREAKER_SETTINGS).toEqual({
      maxDailyLossR: null,
      maxTradesPerDay: null,
      cooldownAfterLosses: null,
      cooldownMinutes: null,
      modes: ['live'],
    });
  });
});
