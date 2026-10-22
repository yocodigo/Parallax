import { describe, expect, it } from 'vitest';
import { BREAKER_LABELS, circuitBreakers, describeBreaker } from '../circuitBreakers';

// 2:00 PM in New York on Thursday, Oct 22.
const now = new Date('2026-10-22T18:00:00Z');

const settings = {
  maxDailyLossR: 3,
  maxTradesPerDay: 4,
  cooldownAfterLosses: 3,
  cooldownMinutes: 60,
  modes: ['live'],
};

// A live long with 1R = $100, opened at `openedAt` and, unless `open`,
// closed for `r` at `closedAt`.
function trade({ r = 1, openedAt = '2026-10-22T14:00:00Z', closedAt = '2026-10-22T15:00:00Z', mode = 'live', open = false } = {}) {
  return {
    mode,
    direction: 'long',
    quantity: 100,
    multiplier: 1,
    entryPrice: 50,
    initialStop: 49,
    exitPrice: open ? null : 50 + r,
    fees: 0,
    openedAt: new Date(openedAt),
    closedAt: open ? null : new Date(closedAt),
  };
}

const breakers = (trades, overrides = {}) =>
  circuitBreakers({ ...settings, ...overrides }, trades, { now }).tripped.map((b) => b.breaker);

describe('circuitBreakers', () => {
  it('trips the daily loss limit once the day’s closed trades reach it', () => {
    const result = circuitBreakers(settings, [trade({ r: -2 }), trade({ r: -1 })], { now });

    expect(result.tripped).toContainEqual({ breaker: 'dailyLoss', limitR: 3, todayR: -3 });
    expect(result.today).toMatchObject({ r: -3 });
  });

  it('counts only today, in New York time', () => {
    // 11 PM on Wednesday in New York is already Thursday in UTC.
    const lateYesterday = trade({ r: -3, openedAt: '2026-10-22T02:00:00Z', closedAt: '2026-10-22T03:00:00Z' });

    expect(breakers([lateYesterday], { cooldownAfterLosses: null })).toEqual([]);
  });

  it('trips the trade limit once today’s entries reach it', () => {
    const trades = [trade(), trade(), trade(), trade({ open: true })];

    expect(circuitBreakers(settings, trades, { now }).tripped).toContainEqual({
      breaker: 'tradesPerDay',
      limit: 4,
      today: 4,
    });
  });

  it('starts a cool-down after enough losses in a row', () => {
    const trades = [
      trade({ r: -0.5, closedAt: '2026-10-22T15:00:00Z' }),
      trade({ r: -0.5, closedAt: '2026-10-22T16:00:00Z' }),
      trade({ r: -0.5, closedAt: '2026-10-22T17:30:00Z' }),
    ];

    expect(circuitBreakers(settings, trades, { now }).tripped).toContainEqual({
      breaker: 'cooldown',
      losses: 3,
      minutes: 60,
      until: '2026-10-22T18:30:00.000Z',
    });
  });

  it('ends the cool-down once the time has passed', () => {
    // The last loss closed at 16:00 UTC; an hour later, by 17:00, the cool-down is over.
    const trades = [4, 5, 6].map((hour) => trade({ r: -0.5, closedAt: `2026-10-22T1${hour}:00:00Z` }));

    expect(breakers(trades, { maxDailyLossR: null })).toEqual([]);
  });

  it('needs the losses to be in a row', () => {
    const trades = [
      trade({ r: -0.5, closedAt: '2026-10-22T15:00:00Z' }),
      trade({ r: 1, closedAt: '2026-10-22T16:00:00Z' }),
      trade({ r: -0.5, closedAt: '2026-10-22T17:00:00Z' }),
      trade({ r: -0.5, closedAt: '2026-10-22T17:30:00Z' }),
    ];

    expect(breakers(trades, { maxTradesPerDay: null })).toEqual([]);
    expect(circuitBreakers(settings, trades, { now }).losingStreak).toBe(2);
  });

  it('ignores a limit that is off', () => {
    const trades = [trade({ r: -2 }), trade({ r: -2 })];

    expect(breakers(trades, { maxDailyLossR: null })).toEqual([]);
  });

  it('counts only trades in the chosen modes', () => {
    const paper = [trade({ r: -2, mode: 'paper' }), trade({ r: -2, mode: 'paper' })];

    expect(breakers(paper)).toEqual([]);
    expect(breakers(paper, { modes: ['live', 'paper'] })).toContain('dailyLoss');
  });
});

describe('describeBreaker', () => {
  it('says what was reached, with the numbers', () => {
    expect(describeBreaker({ breaker: 'dailyLoss', limitR: 3, todayR: -3.2 })).toBe(
      'Daily loss limit reached: -3.2R today against a limit of 3.0R.'
    );
    expect(describeBreaker({ breaker: 'tradesPerDay', limit: 4, today: 4 })).toBe(
      'Trade limit reached: 4 of 4 trades today.'
    );
  });

  it('gives the end of a cool-down in New York time', () => {
    expect(describeBreaker({ breaker: 'cooldown', losses: 3, minutes: 60, until: '2026-10-22T18:30:00.000Z' })).toBe(
      'Cool-down after 3 losses in a row, until 2:30 PM ET.'
    );
  });

  it('has a short label for each breaker', () => {
    expect(BREAKER_LABELS).toEqual({ dailyLoss: 'Daily loss limit', tradesPerDay: 'Trade limit', cooldown: 'Cool-down' });
  });
});
