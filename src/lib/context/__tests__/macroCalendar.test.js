import { describe, expect, it } from 'vitest';
import { macroEvents } from '../macroCalendar';

describe('macroEvents', () => {
  it('lists the scheduled releases on a day and the next weekday', () => {
    // Oct 28, 2026 is the second day of the FOMC meeting; Nov 6 is a jobs report.
    expect(macroEvents('2026-10-28')).toEqual({ today: ['FOMC decision'], nextWeekday: [] });
    expect(macroEvents('2026-11-05')).toEqual({ today: [], nextWeekday: ['Jobs report'] });
  });

  it('looks past the weekend for the next weekday', () => {
    // Friday Jan 8, 2027 is a jobs report; Monday follows Friday.
    expect(macroEvents('2027-01-07').nextWeekday).toEqual(['Jobs report']);
    expect(macroEvents('2026-11-06').nextWeekday).toEqual([]);
  });

  it('has CPI dates', () => {
    expect(macroEvents('2026-11-10').today).toEqual(['CPI']);
  });

  it('is null, meaning unknown, outside the dates the schedule covers', () => {
    expect(macroEvents('2026-06-10')).toBeNull();
    expect(macroEvents('2028-01-05')).toBeNull();
  });
});
