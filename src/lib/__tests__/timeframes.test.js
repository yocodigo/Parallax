import { describe, it, expect } from 'vitest';
import {
  TIMEFRAMES,
  getTimeframe,
  maxDaysFor,
  windowsFor,
  isAllowed,
  clampWindow,
} from '../timeframes';

describe('getTimeframe', () => {
  it('returns the entry for a known timeframe', () => {
    expect(getTimeframe('1Day')?.label).toBe('Daily');
  });
  it('returns null for an unknown timeframe', () => {
    expect(getTimeframe('2Day')).toBeNull();
    expect(getTimeframe('banana')).toBeNull();
  });
});

describe('maxDaysFor', () => {
  it('gives the cap for a timeframe', () => {
    expect(maxDaysFor('1Min')).toBe(5);
    expect(maxDaysFor('1Day')).toBe(1825);
  });
  it('is null for unknown timeframes', () => {
    expect(maxDaysFor('99Min')).toBeNull();
  });
});

describe('windowsFor', () => {
  it('only returns windows within the cap', () => {
    const days = windowsFor('1Min').map((w) => w.days);
    expect(days).toEqual([1, 5]);
  });
  it('returns the full list for daily', () => {
    expect(windowsFor('1Day').map((w) => w.days)).toContain(1825);
  });
  it('never returns an empty list', () => {
    expect(windowsFor('1Min').length).toBeGreaterThan(0);
  });
});

describe('isAllowed', () => {
  it('accepts a pair within the cap', () => {
    expect(isAllowed('1Min', 5)).toBe(true);
    expect(isAllowed('1Day', 1825)).toBe(true);
  });
  it('rejects a window past the cap', () => {
    expect(isAllowed('1Min', 30)).toBe(false);
    expect(isAllowed('1Day', 5000)).toBe(false);
  });
  it('rejects unknown timeframes', () => {
    expect(isAllowed('2Day', 5)).toBe(false);
  });
});

describe('clampWindow', () => {
  it('keeps the current window when the timeframe offers it', () => {
    expect(clampWindow('1Day', 90)).toBe(90);
  });
  it('snaps to the largest window that fits when the current one is too long', () => {
    expect(clampWindow('1Min', 90)).toBe(5);
    expect(clampWindow('1Hour', 1825)).toBe(365);
  });
});

describe('every timeframe is internally consistent', () => {
  it('has a positive cap and required fields', () => {
    for (const t of TIMEFRAMES) {
      expect(t.value).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.maxDays).toBeGreaterThan(0);
    }
  });
});