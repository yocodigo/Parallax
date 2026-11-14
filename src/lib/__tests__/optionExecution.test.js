import { describe, expect, it } from 'vitest';
import { holdTime, untriggeredExits } from '../optionExecution';

// A closed long option, one contract, held `seconds`: gross P/L is
// (exit - entry) * 100, less `fees`.
function option(gross, { seconds = 60, fees = 0, ...overrides } = {}) {
  const openedAt = new Date('2026-04-13T14:00:00Z');
  return {
    assetClass: 'option',
    direction: 'long',
    quantity: 1,
    multiplier: 100,
    entryPrice: 1,
    exitPrice: 1 + gross / 100,
    fees,
    openedAt,
    closedAt: new Date(openedAt.getTime() + seconds * 1000),
    ...overrides,
  };
}

describe('holdTime', () => {
  it('buckets option trades by how long they were held, every bucket always there', () => {
    const rows = holdTime([
      option(-5, { seconds: 30 }),
      option(5, { seconds: 59 }),
      option(10, { seconds: 60 }),
      option(-4, { seconds: 179 }),
      option(8, { seconds: 180 }),
      option(6, { seconds: 600 }),
      option(20, { seconds: 900 }),
    ]);

    expect(rows.map((row) => [row.key, row.trades])).toEqual([
      ['under1', 2],
      ['1to3', 2],
      ['3to5', 1],
      ['5to15', 1],
      ['15plus', 1],
    ]);
  });

  it('gives each bucket its win rate on gross P/L and its net P/L after fees', () => {
    const [under1] = holdTime([
      option(5, { seconds: 20, fees: 2 }),
      option(-10, { seconds: 40, fees: 2 }),
      option(0, { seconds: 50, fees: 2 }),
    ]);

    expect(under1).toMatchObject({ trades: 3, winRate: 1 / 3, netPnl: -11 });
  });

  it('leaves a bucket with no trades with a null win rate and zero P/L', () => {
    const rows = holdTime([option(5, { seconds: 30 })]);

    expect(rows.find((row) => row.key === '15plus')).toMatchObject({ trades: 0, winRate: null, netPnl: 0 });
  });

  it('leaves out stocks, open trades, and trades with no entry time', () => {
    const rows = holdTime([
      option(5, { assetClass: 'stock' }),
      option(5, { exitPrice: null, closedAt: null }),
      option(5, { openedAt: null }),
    ]);

    expect(rows.every((row) => row.trades === 0)).toBe(true);
  });
});

// The rule settings the triggers read: a backstop 25% under the premium and a
// time stop at 15 minutes.
const RULES = { backstopOn: true, backstopPct: 0.25, timeStopOn: true, timeStopMinutes: 15 };

describe('untriggeredExits', () => {
  // Bought at 1.00. A sale at 0.75 or lower fills the backstop; 15 minutes of
  // holding is the time stop. Anything else was nobody's rule.
  it('splits exits into those a backstop or time stop explains and those with no trigger', () => {
    const result = untriggeredExits(
      [
        option(-25, { seconds: 30 }), // sold at 0.75: the backstop
        option(-40, { seconds: 90 }), // through the backstop
        option(3, { seconds: 900 }), // out at the time stop
        option(5, { seconds: 45 }), // a quick win, no trigger
        option(-10, { seconds: 120 }), // a small loss, no trigger
      ],
      RULES
    );

    expect(result).toMatchObject({
      trades: 5,
      triggered: { trades: 3, netPnl: -62 },
      untriggered: { trades: 2, netPnl: -5 },
      untriggeredShare: 0.4,
    });
  });

  it('counts a trade past both as the backstop and once', () => {
    const result = untriggeredExits([option(-30, { seconds: 1200 })], RULES);

    expect(result.triggered.trades).toBe(1);
  });

  it('does not count a trigger whose rule is off', () => {
    const result = untriggeredExits([option(-30, { seconds: 30 }), option(3, { seconds: 900 })], {
      ...RULES,
      backstopOn: false,
    });

    expect(result).toMatchObject({ triggered: { trades: 1 }, untriggered: { trades: 1 } });
  });

  it('has no share without trades', () => {
    expect(untriggeredExits([], RULES)).toMatchObject({ trades: 0, untriggeredShare: null });
  });
});
