import { describe, expect, it } from 'vitest';
import { gapPercent, minutesSinceOpen, relativeStrength, relativeVolume, sma, trendOf } from '../indicators';

describe('sma', () => {
  it('averages the last n values, or is null without enough of them', () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5);
    expect(sma([1, 2], 3)).toBeNull();
  });
});

describe('trendOf', () => {
  const rising = Array.from({ length: 60 }, (_, i) => 100 + i);

  it('is up when price is above a 20-day average that is above the 50-day', () => {
    expect(trendOf(rising, 170)).toBe('up');
  });

  it('is down in the mirror case', () => {
    expect(trendOf([...rising].reverse(), 30)).toBe('down');
  });

  it('is sideways otherwise', () => {
    // Above both averages, but the 20-day is still below the 50-day.
    expect(trendOf([...rising].reverse(), 200)).toBe('sideways');
  });

  it('is null without 50 days of closes', () => {
    expect(trendOf(rising.slice(0, 40), 150)).toBeNull();
  });
});

describe('gapPercent', () => {
  it("is today's open against yesterday's close", () => {
    expect(gapPercent(102, 100)).toBe(2);
    expect(gapPercent(97, 100)).toBe(-3);
  });
});

describe('relativeStrength', () => {
  it('is the stock’s change minus the benchmark’s, in percentage points', () => {
    // Stock +10%, SPY +4%.
    expect(relativeStrength({ from: 100, to: 110 }, { from: 500, to: 520 })).toBeCloseTo(6);
  });
});

describe('minutesSinceOpen', () => {
  it('counts from 9:30 AM New York time', () => {
    expect(minutesSinceOpen(new Date('2026-10-20T14:15:00Z'))).toBe(45);
  });

  it('is null outside the regular session', () => {
    expect(minutesSinceOpen(new Date('2026-10-20T12:00:00Z'))).toBeNull();
  });
});

describe('relativeVolume', () => {
  it("compares today's volume so far with the average day's volume by the same point", () => {
    // 2 hours (120 of 390 minutes) in, with 600k traded against a 1.3M average day.
    expect(relativeVolume(600_000, 1_300_000, 120)).toBeCloseTo(1.5);
  });

  it('is null before the open or without an average', () => {
    expect(relativeVolume(1000, 1_000_000, null)).toBeNull();
    expect(relativeVolume(1000, null, 60)).toBeNull();
  });
});
