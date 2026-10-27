import { describe, expect, it } from 'vitest';
import { lastClosedBy, roomToBand } from '../room';

// Twenty 1m closes alternating 9 and 11: the bands are 8, 10, and 12, and
// each bar's true range is 2.25, so the ATR is 2.25 and the room needed is
// half of it, 1.125.
const bars = Array.from({ length: 20 }, (_, k) => {
  const c = k % 2 ? 11 : 9;
  return { h: c + 0.25, l: c - 0.25, c };
});

describe('roomToBand', () => {
  it('measures from the entry close to the upper band for a long, needing half a 1m ATR', () => {
    expect(roomToBand(bars, 19, 'long', 10.8)).toEqual({ distance: 12 - 10.8, needed: 1.125, ok: true });
    expect(roomToBand(bars, 19, 'long', 11).ok).toBe(false);
  });

  it('measures down to the lower band for a short', () => {
    expect(roomToBand(bars, 19, 'short', 9.2)).toMatchObject({ ok: true });
    expect(roomToBand(bars, 19, 'short', 9).ok).toBe(false);
  });

  it('has no room when the close is already past the band', () => {
    expect(roomToBand(bars, 19, 'long', 12.5)).toMatchObject({ distance: -0.5, ok: false });
  });

  it('ignores bars after k', () => {
    const later = [...bars, { h: 50, l: 1, c: 40 }];
    expect(roomToBand(later, 19, 'long', 10.8)).toEqual(roomToBand(bars, 19, 'long', 10.8));
  });

  it('is null without enough bars for the bands', () => {
    expect(roomToBand(bars, 18, 'long', 10.8)).toBeNull();
  });
});

describe('lastClosedBy', () => {
  const minutes = ['13:30', '13:31', '13:32', '13:33', '13:34', '13:35'].map((time) => ({ t: `2026-10-26T${time}:00Z` }));

  it('finds the last 1m bar that had closed by a time', () => {
    // A 5m entry starting at 13:30 closes at 13:35, with the 13:34 minute.
    expect(lastClosedBy(minutes, Date.parse('2026-10-26T13:35:00Z'))).toBe(4);
    expect(lastClosedBy(minutes, Date.parse('2026-10-26T13:34:30Z'))).toBe(3);
  });

  it('is -1 when none had', () => {
    expect(lastClosedBy(minutes, Date.parse('2026-10-26T13:30:59Z'))).toBe(-1);
  });
});
