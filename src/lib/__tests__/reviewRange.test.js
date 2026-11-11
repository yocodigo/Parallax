import { describe, expect, it } from 'vitest';
import { nyMidnight, parseReviewRange } from '../reviewRange';

// Tuesday 2026-04-14, noon in New York (EDT).
const NOW = new Date('2026-04-14T16:00:00Z');

describe('nyMidnight', () => {
  it('is 04:00Z in daylight time and 05:00Z in standard time', () => {
    expect(nyMidnight('2026-04-14').toISOString()).toBe('2026-04-14T04:00:00.000Z');
    expect(nyMidnight('2026-01-05').toISOString()).toBe('2026-01-05T05:00:00.000Z');
  });

  it('follows the clock change itself: midnight on the day clocks spring forward is still standard time', () => {
    expect(nyMidnight('2026-03-08').toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(nyMidnight('2026-03-09').toISOString()).toBe('2026-03-09T04:00:00.000Z');
    // Clocks fall back on 2026-11-01.
    expect(nyMidnight('2026-11-01').toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(nyMidnight('2026-11-02').toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });
});

describe('parseReviewRange', () => {
  it('reads the last 7 days as today and the six New York days before it', () => {
    expect(parseReviewRange({ range: '7d' }, NOW)).toEqual({
      ok: true,
      key: '7d',
      label: 'Last 7 days',
      fromDay: '2026-04-08',
      toDay: '2026-04-14',
      from: new Date('2026-04-08T04:00:00Z'),
      to: new Date('2026-04-15T04:00:00Z'),
    });
  });

  it('reads the last 30 days the same way', () => {
    expect(parseReviewRange({ range: '30d' }, NOW)).toMatchObject({
      key: '30d',
      label: 'Last 30 days',
      fromDay: '2026-03-16',
      from: new Date('2026-03-16T04:00:00Z'),
    });
  });

  it('counts a late evening in New York as that day, though it is already the next day in UTC', () => {
    // 22:00 on Tuesday the 14th in New York.
    expect(parseReviewRange({ range: '7d' }, new Date('2026-04-15T02:00:00Z'))).toMatchObject({ toDay: '2026-04-14' });
  });

  it('reads all time as no bounds and no dates', () => {
    expect(parseReviewRange({ range: 'all' }, NOW)).toEqual({
      ok: true,
      key: 'all',
      label: 'All time',
      fromDay: null,
      toDay: null,
      from: null,
      to: null,
    });
  });

  it('reads a custom range as whole days, both ends included, keyed by its dates', () => {
    expect(parseReviewRange({ range: 'custom', from: '2026-03-08', to: '2026-03-08' }, NOW)).toEqual({
      ok: true,
      key: 'custom:2026-03-08:2026-03-08',
      label: '2026-03-08 to 2026-03-08',
      fromDay: '2026-03-08',
      toDay: '2026-03-08',
      from: new Date('2026-03-08T05:00:00Z'),
      to: new Date('2026-03-09T04:00:00Z'),
    });
  });

  it.each([
    ['an unknown range', { range: 'year' }],
    ['no range', {}],
    ['an inherited property name', { range: 'toString' }],
    ['a custom range with no dates', { range: 'custom' }],
    ['a custom range with one date', { range: 'custom', from: '2026-04-01' }],
    ['a date that is not one', { range: 'custom', from: '2026-02-30', to: '2026-03-01' }],
    ['a date in another format', { range: 'custom', from: '04/01/2026', to: '2026-04-02' }],
    ['dates the wrong way round', { range: 'custom', from: '2026-04-10', to: '2026-04-01' }],
  ])('rejects %s', (_, query) => {
    expect(parseReviewRange(query, NOW)).toMatchObject({ ok: false, error: expect.any(String) });
  });
});
