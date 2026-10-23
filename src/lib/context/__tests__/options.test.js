import { describe, expect, it } from 'vitest';
import { expectedMove, occSymbol, spreadPercent, yearsToExpiration } from '../options';

describe('occSymbol', () => {
  it('builds the OCC contract symbol Alpaca uses', () => {
    expect(occSymbol({ symbol: 'SPY', expiration: '2026-10-23', optionType: 'call', strike: 776 })).toBe(
      'SPY261023C00776000'
    );
    expect(occSymbol({ symbol: 'AAPL', expiration: '2027-01-15', optionType: 'put', strike: 212.5 })).toBe(
      'AAPL270115P00212500'
    );
  });
});

describe('spreadPercent', () => {
  it('is the bid-ask spread as a percent of the midpoint', () => {
    expect(spreadPercent(0.95, 1.05)).toBeCloseTo(10);
  });

  it('is null without a two-sided quote', () => {
    expect(spreadPercent(0, 0)).toBeNull();
  });
});

describe('yearsToExpiration', () => {
  it('runs to 4 PM New York time on expiration day', () => {
    // 2:00 PM EDT on expiration day: two hours left.
    expect(yearsToExpiration(new Date('2026-10-23T18:00:00Z'), '2026-10-23')).toBeCloseTo(2 / (365 * 24));
  });

  it('uses 4 PM EST in winter', () => {
    // 3:00 PM EST (20:00 UTC) on expiration day: one hour left.
    expect(yearsToExpiration(new Date('2027-01-15T20:00:00Z'), '2027-01-15')).toBeCloseTo(1 / (365 * 24));
  });

  it('is zero once expired', () => {
    expect(yearsToExpiration(new Date('2026-10-24T14:00:00Z'), '2026-10-23')).toBe(0);
  });
});

describe('expectedMove', () => {
  it('is price times implied volatility times the square root of the time left', () => {
    // 500 x 20% x sqrt(0.25) = 50.
    expect(expectedMove(500, 0.2, 0.25)).toBeCloseTo(50);
  });

  it('is null without a price or volatility', () => {
    expect(expectedMove(null, 0.2, 0.25)).toBeNull();
    expect(expectedMove(500, null, 0.25)).toBeNull();
  });
});
