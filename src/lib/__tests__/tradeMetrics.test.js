import { describe, expect, it } from 'vitest';
import { initialRisk, profitLoss, rMultiple, tradeStatus } from '../tradeMetrics';

// A closed long: bought 100 at 50 with a stop at 48 (2.00 of risk a share),
// sold at 54.
function trade(overrides = {}) {
  return {
    direction: 'long',
    quantity: 100,
    multiplier: 1,
    plannedEntry: 50,
    entryPrice: 50,
    initialStop: 48,
    exitPrice: 54,
    fees: 0,
    openedAt: new Date('2026-10-19T14:00:00Z'),
    closedAt: new Date('2026-10-20T15:00:00Z'),
    ...overrides,
  };
}

const planned = { entryPrice: null, exitPrice: null, openedAt: null, closedAt: null };
const open = { exitPrice: null, closedAt: null };

describe('tradeStatus', () => {
  it('is derived from the timestamps', () => {
    expect(tradeStatus(trade(planned))).toBe('planned');
    expect(tradeStatus(trade(open))).toBe('open');
    expect(tradeStatus(trade())).toBe('closed');
  });
});

describe('profitLoss', () => {
  it('is the price move times the size for a long', () => {
    expect(profitLoss(trade())).toBe(400);
  });

  it('gains when the price falls for a short', () => {
    expect(profitLoss(trade({ direction: 'short', initialStop: 52, exitPrice: 47 }))).toBe(300);
  });

  it('scales option premiums by the multiplier', () => {
    // 2 contracts bought at 1.50, sold at 2.25: 0.75 x 2 x 100.
    const option = trade({ quantity: 2, multiplier: 100, entryPrice: 1.5, initialStop: 0.75, exitPrice: 2.25 });

    expect(profitLoss(option)).toBeCloseTo(150);
  });

  it('subtracts fees', () => {
    expect(profitLoss(trade({ fees: 2.5 }))).toBe(397.5);
  });

  it('is null until the trade is closed', () => {
    expect(profitLoss(trade(planned))).toBeNull();
    expect(profitLoss(trade(open))).toBeNull();
  });
});

describe('initialRisk', () => {
  it('is the distance from the entry fill to the stop, times the size', () => {
    expect(initialRisk(trade({ entryPrice: 50.5 }))).toBe(250);
  });

  it('uses the planned entry before the trade is filled', () => {
    expect(initialRisk(trade(planned))).toBe(200);
  });

  it('is null without a stop', () => {
    expect(initialRisk(trade({ initialStop: null }))).toBeNull();
  });
});

describe('rMultiple', () => {
  it('is the profit or loss in units of the initial risk', () => {
    expect(rMultiple(trade())).toBe(2);
  });

  it('is -1 when the stop is hit exactly', () => {
    expect(rMultiple(trade({ exitPrice: 48 }))).toBe(-1);
  });

  it('counts fees against the result', () => {
    // (400 - 20) / 200
    expect(rMultiple(trade({ fees: 20 }))).toBe(1.9);
  });

  it('is null until the trade is closed, or without a stop', () => {
    expect(rMultiple(trade(open))).toBeNull();
    expect(rMultiple(trade({ initialStop: null }))).toBeNull();
  });

  it('is null when the entry was filled at the stop, leaving no risk to measure against', () => {
    expect(rMultiple(trade({ entryPrice: 48 }))).toBeNull();
  });
});
