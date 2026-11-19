import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ZONE,
  formatInZone,
  fromZoneInput,
  readDisplayZone,
  saveDisplayZone,
  toZoneInput,
  WRITTEN,
} from '../displayZone';

const memory = (initial = {}) => {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => (data[key] = value),
    removeItem: (key) => delete data[key],
  };
};

describe('readDisplayZone', () => {
  it('is Pacific until a zone is saved', () => {
    expect(DEFAULT_ZONE).toBe('America/Los_Angeles');
    expect(readDisplayZone(memory())).toBe(DEFAULT_ZONE);
  });

  it('reads a saved zone from the list', () => {
    expect(readDisplayZone(memory({ displayZone: 'America/New_York' }))).toBe('America/New_York');
  });

  it('ignores a saved value that is not one of the zones', () => {
    expect(readDisplayZone(memory({ displayZone: 'Mars/Olympus' }))).toBe(DEFAULT_ZONE);
  });

  it('falls back when storage throws', () => {
    const blocked = {
      getItem() {
        throw new Error('blocked');
      },
    };
    expect(readDisplayZone(blocked)).toBe(DEFAULT_ZONE);
  });
});

describe('saveDisplayZone', () => {
  it('saves a zone and says so', () => {
    const store = memory();
    expect(saveDisplayZone(store, 'America/Chicago')).toBe(true);
    expect(store.getItem('displayZone')).toBe('America/Chicago');
  });

  it('says when storage refused', () => {
    const blocked = {
      setItem() {
        throw new Error('blocked');
      },
    };
    expect(saveDisplayZone(blocked, 'America/Chicago')).toBe(false);
  });
});

describe('formatInZone', () => {
  // 15:43 UTC on 2026-11-10 is 10:43 in New York (EST) and 7:43 in Los Angeles (PST).
  const instant = '2026-11-10T15:43:00.000Z';

  it('formats the same moment on each zone clock', () => {
    const clock = { hour: 'numeric', minute: '2-digit' };
    expect(formatInZone(instant, 'America/New_York', clock)).toBe('10:43 AM');
    expect(formatInZone(instant, 'America/Los_Angeles', clock)).toBe('7:43 AM');
  });

  it('can name the zone', () => {
    expect(formatInZone(instant, 'America/Los_Angeles', { hour: 'numeric', timeZoneName: 'short' })).toContain('PST');
  });

  it('moves the date with the clock', () => {
    // 03:00 UTC is still the evening before in Los Angeles.
    expect(formatInZone('2026-11-11T03:00:00.000Z', 'America/Los_Angeles', { month: 'short', day: 'numeric' })).toBe('Nov 10');
  });
});

describe('formatInZone with WRITTEN', () => {
  it('spells out the date, the clock, and the zone', () => {
    expect(formatInZone('2026-04-14T20:30:00.000Z', 'America/Los_Angeles', WRITTEN)).toBe('Apr 14, 2026, 1:30 PM PDT');
  });
});

// A datetime-local input holds a wall-clock "YYYY-MM-DDTHH:mm" with no zone.
describe('toZoneInput and fromZoneInput', () => {
  it('shows an instant as the zone clock reads it', () => {
    expect(toZoneInput('2026-11-10T15:43:00.000Z', 'America/Los_Angeles')).toBe('2026-11-10T07:43');
    expect(toZoneInput('2026-11-10T15:43:00.000Z', 'America/New_York')).toBe('2026-11-10T10:43');
  });

  it('reads what was typed on the zone clock back as the instant', () => {
    expect(fromZoneInput('2026-11-10T07:43', 'America/Los_Angeles')).toBe('2026-11-10T15:43:00.000Z');
    expect(fromZoneInput('2026-07-10T14:05', 'America/New_York')).toBe('2026-07-10T18:05:00.000Z');
  });

  it('handles the day the clocks change', () => {
    // Daylight time began 2026-03-08 at 2:00 in New York.
    expect(fromZoneInput('2026-03-08T09:35', 'America/New_York')).toBe('2026-03-08T13:35:00.000Z');
    expect(fromZoneInput('2026-03-08T01:30', 'America/New_York')).toBe('2026-03-08T06:30:00.000Z');
  });

  it('puts a time the clocks skip an hour earlier, and a repeated time on its first pass', () => {
    // 2:30 never happened on 2026-03-08 in New York; 1:30 on 2026-11-01 happened twice.
    expect(fromZoneInput('2026-03-08T02:30', 'America/New_York')).toBe('2026-03-08T06:30:00.000Z');
    expect(fromZoneInput('2026-11-01T01:30', 'America/New_York')).toBe('2026-11-01T05:30:00.000Z');
  });

  it('round-trips', () => {
    const iso = '2026-10-23T18:41:00.000Z';
    expect(fromZoneInput(toZoneInput(iso, 'America/Denver'), 'America/Denver')).toBe(iso);
  });

  it('is undefined for a blank input', () => {
    expect(fromZoneInput('', 'America/Chicago')).toBeUndefined();
  });
});
