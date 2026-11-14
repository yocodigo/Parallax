import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BACKSTOP_PCT, LOCKOUTS, PREMIUM_MIN, SIZE_MAX, SIZE_MIN, TIME_STOP } from '../setups/settings';
import { DEFAULT_RULE_SETTINGS, parseRuleSettings } from '../ruleSettings';

const errorsOf = (result) => z.flattenError(result.error).fieldErrors;

describe('DEFAULT_RULE_SETTINGS', () => {
  it('starts from the named defaults in settings.js, every rule on and no risk per trade', () => {
    expect(DEFAULT_RULE_SETTINGS).toEqual({
      windowsOn: true,
      windows: LOCKOUTS,
      sizeOn: true,
      sizeMin: SIZE_MIN,
      sizeMax: SIZE_MAX,
      premiumBandOn: true,
      premiumMin: PREMIUM_MIN,
      premiumMax: null,
      riskPerTrade: null,
      backstopOn: true,
      backstopPct: BACKSTOP_PCT,
      timeStopOn: true,
      timeStopMinutes: TIME_STOP,
    });
  });
});

describe('parseRuleSettings', () => {
  it('accepts the defaults as they are', () => {
    expect(parseRuleSettings(DEFAULT_RULE_SETTINGS)).toEqual({ success: true, data: DEFAULT_RULE_SETTINGS });
  });

  it('fills anything left out from the defaults', () => {
    expect(parseRuleSettings({}).data).toEqual(DEFAULT_RULE_SETTINGS);
  });

  it('lets a rule be off while keeping its values', () => {
    const result = parseRuleSettings({ windowsOn: false, backstopOn: false });

    expect(result.data).toMatchObject({ windowsOn: false, windows: LOCKOUTS, backstopOn: false, backstopPct: 0.25 });
  });

  it('requires each window to be HH:MM times with the start before the end', () => {
    const result = parseRuleSettings({
      windows: [
        ['9:30', '09:45'],
        ['11:00', '10:00'],
      ],
    });

    expect(errorsOf(result)).toHaveProperty('windows');
  });

  it('requires a whole-number size range, smallest first', () => {
    expect(errorsOf(parseRuleSettings({ sizeMin: 0 }))).toHaveProperty('sizeMin');
    expect(errorsOf(parseRuleSettings({ sizeMax: 1.5 }))).toHaveProperty('sizeMax');
    expect(errorsOf(parseRuleSettings({ sizeMin: 3, sizeMax: 2 }))).toHaveProperty('sizeMax');
  });

  it('takes a premium band of a minimum with an optional, higher maximum', () => {
    expect(parseRuleSettings({ premiumMin: 0.4, premiumMax: 3 }).success).toBe(true);
    expect(errorsOf(parseRuleSettings({ premiumMin: 0 }))).toHaveProperty('premiumMin');
    expect(errorsOf(parseRuleSettings({ premiumMin: 2, premiumMax: 1 }))).toHaveProperty('premiumMax');
  });

  it('keeps the backstop between 0 and 100% of the premium', () => {
    expect(errorsOf(parseRuleSettings({ backstopPct: 0 }))).toHaveProperty('backstopPct');
    expect(errorsOf(parseRuleSettings({ backstopPct: 1 }))).toHaveProperty('backstopPct');
    expect(parseRuleSettings({ backstopPct: 0.3 }).data.backstopPct).toBe(0.3);
  });

  it('takes a time stop in whole minutes above zero', () => {
    expect(errorsOf(parseRuleSettings({ timeStopMinutes: 0 }))).toHaveProperty('timeStopMinutes');
    expect(errorsOf(parseRuleSettings({ timeStopMinutes: 7.5 }))).toHaveProperty('timeStopMinutes');
  });

  it('takes risk per trade above zero, or null for not set', () => {
    expect(parseRuleSettings({ riskPerTrade: 20 }).data.riskPerTrade).toBe(20);
    expect(parseRuleSettings({ riskPerTrade: null }).data.riskPerTrade).toBeNull();
    expect(errorsOf(parseRuleSettings({ riskPerTrade: 0 }))).toHaveProperty('riskPerTrade');
  });
});
