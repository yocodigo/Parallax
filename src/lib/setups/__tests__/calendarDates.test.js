import { describe, expect, it } from 'vitest';
import { isPressureDate, seasonalDate } from '../calendarDates';

describe('isPressureDate', () => {
  it('is true on the days of the month in each pressure range, ends included', () => {
    for (const day of ['06', '07', '09', '10', '14', '15', '19', '20', '23', '24', '29', '30', '31']) {
      expect(isPressureDate(`2026-10-${day}`)).toBe(true);
    }
  });

  it('is false on the days between the ranges', () => {
    for (const day of ['01', '05', '08', '11', '13', '16', '18', '21', '22', '25', '28']) {
      expect(isPressureDate(`2026-10-${day}`)).toBe(false);
    }
  });

  it('reads the date as written, not shifted into another zone', () => {
    expect(isPressureDate('2026-11-07')).toBe(true);
    expect(isPressureDate('2026-11-08')).toBe(false);
  });
});

describe('seasonalDate', () => {
  it('gives the Gann date a day falls on', () => {
    expect(seasonalDate('2026-09-23')).toBe('09-23');
  });

  it('counts one day either side', () => {
    expect(seasonalDate('2026-09-22')).toBe('09-23');
    expect(seasonalDate('2026-09-24')).toBe('09-23');
  });

  it('is null two days away', () => {
    expect(seasonalDate('2026-09-21')).toBeNull();
    expect(seasonalDate('2026-09-25')).toBeNull();
  });

  it('crosses a month boundary', () => {
    // Mar 20 and Mar 22 flank Mar 21; Nov 6 and Nov 8 flank Nov 7.
    expect(seasonalDate('2026-03-20')).toBe('03-21');
    expect(seasonalDate('2026-11-08')).toBe('11-07');
    // Dec 23 is one day after Dec 22; Jan 1 is not near any date.
    expect(seasonalDate('2026-12-23')).toBe('12-22');
    expect(seasonalDate('2027-01-01')).toBeNull();
  });
});
