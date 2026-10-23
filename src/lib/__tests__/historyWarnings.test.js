import { describe, expect, it } from 'vitest';
import { daysToExpiration, historyWarnings, sessionPart } from '../historyWarnings';

// 2:00 PM in New York (EDT), midday.
const MIDDAY = '2026-10-20T18:00:00Z';
// 3:45 PM in New York, the last 30 minutes.
const LATE = '2026-10-20T19:45:00Z';

let day = 0;
// A closed trade for `r` (1R = $100), entered at `openedAt`. Each one closes a
// day later than the last, so their order is known.
function closedTrade(r, { symbol = 'AAPL', direction = 'long', assetClass = 'stock', openedAt = MIDDAY, expiration = null } = {}) {
  day += 1;
  return {
    symbol,
    direction,
    assetClass,
    expiration,
    quantity: 100,
    multiplier: 1,
    entryPrice: 50,
    // $1 of risk either way; a short loses when the price rises.
    initialStop: direction === 'long' ? 49 : 51,
    exitPrice: direction === 'long' ? 50 + r : 50 - r,
    fees: 0,
    openedAt: new Date(openedAt),
    closedAt: new Date(Date.UTC(2026, 0, day)),
  };
}

const times = (n, make) => Array.from({ length: n }, make);
const plan = { symbol: 'AAPL', direction: 'long', assetClass: 'stock' };
const now = new Date(MIDDAY);

describe('sessionPart', () => {
  it('splits the New York session into the open, midday, and the close', () => {
    expect(sessionPart(new Date('2026-10-20T13:45:00Z'))).toBe('open');
    expect(sessionPart(new Date(MIDDAY))).toBe('midday');
    expect(sessionPart(new Date(LATE))).toBe('close');
  });

  it('is null outside regular hours', () => {
    expect(sessionPart(new Date('2026-10-20T12:00:00Z'))).toBeNull();
    expect(sessionPart(new Date('2026-10-20T21:00:00Z'))).toBeNull();
  });

  it('follows New York time across daylight saving', () => {
    // 9:45 AM EST in January is 14:45 UTC.
    expect(sessionPart(new Date('2026-01-15T14:45:00Z'))).toBe('open');
  });
});

describe('historyWarnings', () => {
  it('warns when past trades in the same symbol lost on average', () => {
    const trades = times(5, () => closedTrade(-1, { openedAt: LATE }));

    expect(historyWarnings(plan, trades, { now })).toContainEqual({
      rule: 'symbol',
      symbol: 'AAPL',
      trades: 5,
      averageR: -1,
    });
  });

  it('warns about the same direction and asset class across symbols', () => {
    const trades = times(5, (_, i) => closedTrade(-0.5, { symbol: `SYM${i}`, direction: 'short', assetClass: 'option', openedAt: LATE }));

    const warnings = historyWarnings({ symbol: 'TSLA', direction: 'short', assetClass: 'option' }, trades, { now });

    expect(warnings).toEqual([{ rule: 'side', direction: 'short', assetClass: 'option', trades: 5, averageR: -0.5 }]);
  });

  it('warns about entering at this time of day', () => {
    const trades = times(6, (_, i) => closedTrade(-0.4, { symbol: `SYM${i}`, direction: 'short', openedAt: LATE }));

    expect(historyWarnings(plan, trades, { now: new Date(LATE) })).toEqual([
      { rule: 'session', sessionPart: 'close', trades: 6, averageR: -0.4 },
    ]);
  });

  it('stays quiet with fewer than 5 similar trades', () => {
    expect(historyWarnings(plan, times(4, () => closedTrade(-2)), { now })).toEqual([]);
  });

  it('stays quiet when similar trades averaged better than -0.3R', () => {
    const trades = [...times(3, () => closedTrade(-1)), ...times(3, () => closedTrade(1))];

    expect(historyWarnings(plan, trades, { now })).toEqual([]);
  });

  it('looks only at the 20 most recent similar trades', () => {
    // 20 old losers, then 20 recent winners: the habit has been fixed.
    const trades = [...times(20, () => closedTrade(-1)), ...times(20, () => closedTrade(0.5))];

    expect(historyWarnings(plan, trades, { now })).toEqual([]);
  });

  it('skips the symbol rule until a symbol is entered', () => {
    const trades = times(5, () => closedTrade(-1, { openedAt: LATE }));

    expect(historyWarnings({ ...plan, symbol: '' }, trades, { now }).map((w) => w.rule)).toEqual(['side']);
  });

  it('lists the worst first', () => {
    const trades = [
      ...times(5, () => closedTrade(-2, { openedAt: LATE })),
      ...times(5, () => closedTrade(-0.5, { symbol: 'MSFT', openedAt: LATE })),
    ];

    expect(historyWarnings(plan, trades, { now }).map((w) => w.rule)).toEqual(['symbol', 'side']);
  });
});

describe('daysToExpiration', () => {
  it('counts calendar days from the New York date to the expiration', () => {
    expect(daysToExpiration('2026-10-20', new Date(MIDDAY))).toBe(0);
    expect(daysToExpiration('2026-10-23', new Date(MIDDAY))).toBe(3);
  });

  it('uses the New York date late in the evening', () => {
    // 9 PM on Oct 19 in New York is Oct 20 in UTC: still one day to go.
    expect(daysToExpiration('2026-10-20', new Date('2026-10-20T01:00:00Z'))).toBe(1);
  });
});

describe('historyWarnings for options', () => {
  // 0DTE SPY calls entered in the last 30 minutes, each a loss.
  const zeroDteLate = (r) =>
    closedTrade(r, { symbol: 'SPY', assetClass: 'option', openedAt: LATE, expiration: '2026-10-20' });
  const optionPlan = { symbol: 'QQQ', direction: 'long', assetClass: 'option', expiration: '2026-10-20' };

  it('warns about trades with the same days to expiration', () => {
    const trades = times(5, () => zeroDteLate(-0.7));

    expect(historyWarnings(optionPlan, trades, { now })).toContainEqual({
      rule: 'dte',
      dte: '0dte',
      trades: 5,
      averageR: -0.7,
    });
  });

  it('warns about the same days to expiration at the same time of day', () => {
    const trades = [
      ...times(5, () => zeroDteLate(-0.7)),
      // Midday 0DTE entries went fine, so 0DTE alone is not the problem...
      ...times(10, () => closedTrade(1, { symbol: 'SPY', assetClass: 'option', expiration: '2026-10-20' })),
      // ...and late stock entries went fine, so the time of day alone isn't either.
      ...times(10, () => closedTrade(1, { openedAt: LATE })),
    ];

    expect(historyWarnings(optionPlan, trades, { now: new Date(LATE) })).toEqual([
      { rule: 'dteSession', dte: '0dte', sessionPart: 'close', trades: 5, averageR: -0.7 },
    ]);
  });

  it('puts a plan expiring later in a different bucket', () => {
    const trades = times(5, () => zeroDteLate(-0.7));

    const warnings = historyWarnings({ ...optionPlan, expiration: '2026-11-20' }, trades, { now });

    expect(warnings.map((w) => w.rule)).not.toContain('dte');
  });
});
