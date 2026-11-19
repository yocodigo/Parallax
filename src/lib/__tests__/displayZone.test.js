import { describe, expect, it } from 'vitest';
import { DEFAULT_ZONE, formatInZone, readDisplayZone, saveDisplayZone } from '../displayZone';

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
