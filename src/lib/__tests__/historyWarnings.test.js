import { describe, expect, it } from 'vitest';
import { historyWarnings, sessionPart } from '../historyWarnings';

// 2:00 PM in New York (EDT), midday.
const MIDDAY = '2026-10-20T18:00:00Z';
// 3:45 PM in New York, the last 30 minutes.
const LATE = '2026-10-20T19:45:00Z';

let day = 0;
// A closed trade for `r` (1R = $100), entered at `openedAt`. Each one closes a
// day later than the last, so their order is known.
function closedTrade(r, { symbol = 'AAPL', direction = 'long', assetClass = 'stock', openedAt = MIDDAY } = {}) {
  day += 1;
  return {
    symbol,
    direction,
    assetClass,
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
