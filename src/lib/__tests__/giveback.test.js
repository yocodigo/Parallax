import { describe, expect, it } from 'vitest';
import { giveback, underlyingGiveback } from '../giveback';

// A closed long stock trade with 1R = $100 (100 shares, $1 to the stop),
// closed for `r`.
function closedTrade(r, overrides = {}) {
  return {
    assetClass: 'stock',
    direction: 'long',
    quantity: 100,
    multiplier: 1,
    entryPrice: 50,
    initialStop: 49,
    exitPrice: 50 + r,
    fees: 0,
    openedAt: new Date('2026-10-20T14:00:00Z'),
    closedAt: new Date('2026-10-20T15:00:00Z'),
    ...overrides,
  };
}

describe('giveback', () => {
  it('flags a trade that was up 1R and closed flat', () => {
    expect(giveback(closedTrade(0), { mfeR: 1 })).toEqual({ mfeR: 1, r: 0, givenBackR: 1, flagged: true });
  });

  it('flags a trade that was up 1.5R and closed at a loss, giving back 2R', () => {
    expect(giveback(closedTrade(-0.5), { mfeR: 1.5 })).toEqual({
      mfeR: 1.5,
      r: -0.5,
      givenBackR: 2,
      flagged: true,
    });
  });

  it('does not flag a trade that never reached 1R in its favor', () => {
    expect(giveback(closedTrade(-1), { mfeR: 0.9 })).toMatchObject({ flagged: false });
  });

  it('does not flag a winner, however much it gave back', () => {
    // Up 3R at best, closed for +0.5R: a giveback, but not a flat or losing one.
    expect(giveback(closedTrade(0.5), { mfeR: 3 })).toMatchObject({ givenBackR: 2.5, flagged: false });
  });

  it('counts fees against the result, so a scratch that paid fees is a loss', () => {
    // Closed at the entry, with $5 of fees: -0.05R.
    expect(giveback(closedTrade(0, { fees: 5 }), { mfeR: 1.2 })).toMatchObject({ r: -0.05, flagged: true });
  });

  it('allows for floating-point error at the 1R threshold', () => {
    // 0.1 + 0.2 + 0.7 is 0.9999999999999999, not 1.
    expect(giveback(closedTrade(0), { mfeR: 0.1 + 0.2 + 0.7 })).toMatchObject({ flagged: true });
  });

  it('allows for floating-point error at the 0R threshold', () => {
    // Exiting at 0.1 + 0.2 against an entry of 0.3 is a scratch, though the
    // sum is 0.30000000000000004 and R comes out a hair above 0.
    const scratch = closedTrade(0, { entryPrice: 0.3, initialStop: 0.2, exitPrice: 0.1 + 0.2 });
    const result = giveback(scratch, { mfeR: 1 });
    expect(result.r).toBeGreaterThan(0);
    expect(result.flagged).toBe(true);
  });

  it('is null for an option, whose excursions are not computed yet', () => {
    const option = closedTrade(0, { assetClass: 'option', optionType: 'call', multiplier: 100 });
    expect(giveback(option, { mfeR: 2 })).toBeNull();
  });

  it('is null without a stop to measure R from, or without excursions', () => {
    expect(giveback(closedTrade(0, { initialStop: null }), { mfeR: null })).toBeNull();
    expect(giveback(closedTrade(0), null)).toBeNull();
  });

  it('is null for a trade that is still open', () => {
    expect(giveback(closedTrade(0, { closedAt: null, exitPrice: null }), { mfeR: 1 })).toBeNull();
  });
});

// rules-v3 section 7: an option's giveback measured on its underlying, from
// its underlying entry to the VWAP of the minute it was closed in.
describe('underlyingGiveback', () => {
  // A bought call: up is in its favor. 580.00 on the underlying at the fill,
  // a derived stop at 579.00 (1R is a point), held 15:16:37 to 15:20:10.
  const call = {
    assetClass: 'option',
    optionType: 'call',
    direction: 'long',
    underlyingEntry: 580,
    underlyingStop: 579,
    underlyingStopSource: 'derived',
    underlyingStopRule: 'band_cross_s2',
    openedAt: new Date('2026-11-10T15:16:37Z'),
    closedAt: new Date('2026-11-10T15:20:10Z'),
  };
  const minute = (m, l, h, vw) => ({ t: `2026-11-10T15:${m}:00Z`, l, h, o: l, c: h, vw });
  // Up 1.5 points at best (581.50 at 15:18), closed in a minute averaging 579.80.
  const bars = [
    minute(16, 579.9, 580.1, 580),
    minute(17, 579.8, 580.6, 580.3),
    minute(18, 580.4, 581.5, 581),
    minute(19, 579.9, 580.8, 580.2),
    minute(20, 579.6, 580, 579.8),
  ];

  it('measures what the underlying gave back, in points and in R, and flags a flat or losing close', () => {
    const result = underlyingGiveback(call, bars);

    expect(result).toMatchObject({ stopSource: 'derived', edgeMinutesOnly: false, flagged: true });
    expect(result.mfe).toBeCloseTo(1.5);
    expect(result.result).toBeCloseTo(-0.2);
    expect(result.givenBack).toBeCloseTo(1.7);
    expect(result.mfeR).toBeCloseTo(1.5);
    expect(result.r).toBeCloseTo(-0.2);
    expect(result.givenBackR).toBeCloseTo(1.7);
  });

  it('reads a put the other way', () => {
    const put = { ...call, optionType: 'put', underlyingStop: 581 };

    const result = underlyingGiveback(put, bars);

    expect(result.mfe).toBeCloseTo(0.4);
    expect(result.result).toBeCloseTo(0.2);
    expect(result.flagged).toBe(false);
  });

  it('gives points only, and no flag, without a stop on the underlying', () => {
    const result = underlyingGiveback({ ...call, underlyingStop: null, underlyingStopSource: null, underlyingStopRule: null }, bars);

    expect(result).toMatchObject({ mfeR: null, r: null, givenBackR: null, flagged: null, stopSource: null });
    expect(result.givenBack).toBeCloseTo(1.7);
  });

  it('has nothing to measure when the exit minute has no VWAP to take the close from', () => {
    const noVwap = [...bars.slice(0, 4), { ...bars[4], vw: undefined }];

    expect(underlyingGiveback(call, noVwap)).toBeNull();
  });

  it('has nothing to measure for an open trade, one without an underlying entry, or one whose exit minute has no bar', () => {
    expect(underlyingGiveback({ ...call, closedAt: null }, bars)).toBeNull();
    expect(underlyingGiveback({ ...call, underlyingEntry: null }, bars)).toBeNull();
    expect(underlyingGiveback(call, bars.slice(0, 4))).toBeNull();
  });
});
