import { describe, expect, it } from 'vitest';
import { sessionBars } from '../session';

const at = (iso) => ({ t: iso, o: 1, h: 1, l: 1, c: 1, v: 1 });
const times = (bars) => bars.map((bar) => bar.t);

describe('sessionBars', () => {
  it('keeps 9:30 AM to 3:59 PM New York, the regular session, on a summer (EDT) day', () => {
    // 2026-10-26 is on EDT: 9:30 AM is 13:30Z and 4:00 PM is 20:00Z.
    const bars = ['13:29', '13:30', '19:59', '20:00'].map((time) => at(`2026-10-26T${time}:00Z`));
    expect(times(sessionBars(bars))).toEqual(['2026-10-26T13:30:00Z', '2026-10-26T19:59:00Z']);
  });

  it('follows the clock change on a winter (EST) day', () => {
    // 2026-12-01 is on EST: 9:30 AM is 14:30Z and 4:00 PM is 21:00Z.
    const bars = ['13:30', '14:29', '14:30', '20:59', '21:00'].map((time) => at(`2026-12-01T${time}:00Z`));
    expect(times(sessionBars(bars))).toEqual(['2026-12-01T14:30:00Z', '2026-12-01T20:59:00Z']);
  });

  it('keeps pre-market and after-hours bars when extended hours are on', () => {
    const bars = ['13:29', '13:30', '20:00'].map((time) => at(`2026-10-26T${time}:00Z`));
    expect(sessionBars(bars, { extendedHours: true })).toEqual(bars);
  });
});
