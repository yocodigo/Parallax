import { describe, expect, it } from 'vitest';
import { barTimeframeFor, barWindow, excursions, underlyingExcursions } from '../excursions';

// Filled at 100 with a stop at 98: 1R is 2.00 a share.
const long = { direction: 'long', entryPrice: 100, initialStop: 98 };
const short = { direction: 'short', entryPrice: 100, initialStop: 103 };

const bar = (l, h) => ({ t: '2026-10-20T14:00:00Z', l, h, o: l, c: h });

describe('excursions', () => {
  it('measures how far a long went against and for the trade', () => {
    expect(excursions(long, [bar(99, 101), bar(97, 100.5), bar(100, 105)])).toEqual({
      mae: 3,
      mfe: 5,
      maeR: 1.5,
      mfeR: 2.5,
    });
  });

  it('measures a short the other way round', () => {
    // Against a short is up (high 101.5), for it is down (low 94).
    expect(excursions(short, [bar(99, 101.5), bar(94, 100)])).toEqual({
      mae: 1.5,
      mfe: 6,
      maeR: 0.5,
      mfeR: 2,
    });
  });

  it("is zero on a side the price never reached, even if a bar's range says otherwise", () => {
    // The free data feed can differ slightly from where the fill happened.
    expect(excursions(long, [bar(100.5, 104)])).toMatchObject({ mae: 0, maeR: 0, mfe: 4 });
  });

  it('has no R without a stop', () => {
    expect(excursions({ ...long, initialStop: null }, [bar(99, 101)])).toEqual({
      mae: 1,
      mfe: 1,
      maeR: null,
      mfeR: null,
    });
  });

  it('is null without any bars', () => {
    expect(excursions(long, [])).toBeNull();
  });
});

describe('barTimeframeFor', () => {
  const at = (iso) => new Date(iso);

  it('uses minute bars for a trade held up to a week', () => {
    expect(barTimeframeFor(at('2026-10-13T14:00:00Z'), at('2026-10-20T14:00:00Z'))).toBe('1Min');
  });

  it('uses hourly bars for a trade held up to a year', () => {
    expect(barTimeframeFor(at('2026-01-02T14:00:00Z'), at('2026-10-20T14:00:00Z'))).toBe('1Hour');
  });

  it('uses daily bars beyond that', () => {
    expect(barTimeframeFor(at('2024-10-20T14:00:00Z'), at('2026-10-20T14:00:00Z'))).toBe('1Day');
  });
});

describe('barWindow', () => {
  const now = new Date('2026-10-22T20:00:00Z');

  it('runs from the start of the bar holding the fill to the exit', () => {
    const trade = { openedAt: new Date('2026-10-20T14:31:45Z'), closedAt: new Date('2026-10-21T15:00:00Z') };

    expect(barWindow(trade, now)).toEqual({
      timeframe: '1Min',
      start: new Date('2026-10-20T14:31:00Z'),
      end: new Date('2026-10-21T15:00:00Z'),
    });
  });

  it('runs to now for a trade still open', () => {
    const trade = { openedAt: new Date('2026-10-20T14:31:00Z'), closedAt: null };

    expect(barWindow(trade, now).end).toEqual(now);
  });

  it('starts hourly bars on the hour, and daily bars at midnight UTC', () => {
    const closedAt = new Date('2026-10-20T15:00:00Z');

    expect(barWindow({ openedAt: new Date('2026-03-02T14:45:00Z'), closedAt }, now).start).toEqual(
      new Date('2026-03-02T14:00:00Z')
    );
    expect(barWindow({ openedAt: new Date('2024-03-02T14:45:00Z'), closedAt }, now).start).toEqual(
      new Date('2024-03-02T00:00:00Z')
    );
  });
});

// rules-v3 section 7: an option measured on the underlying's bars, in points
// from its underlying entry and in structure R from its underlying stop.
describe('underlyingExcursions', () => {
  // A bought call: a bet the underlying goes up. Entered at 580.00 on the
  // underlying with a derived stop at 579.00 (1R is a point), held 15:16:37 to
  // 15:20:10.
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
  const put = { ...call, optionType: 'put', underlyingStop: 581 };
  const minute = (m, l, h) => ({ t: `2026-11-10T15:${m}:00Z`, l, h, o: l, c: h });
  const bars = [minute(16, 579.8, 580.1), minute(17, 579.5, 580.4), minute(18, 579.9, 581.5), minute(19, 580, 581), minute(20, 579.6, 580.2)];

  it('measures the move against and for a call in points and in R, with where the stop came from', () => {
    const result = underlyingExcursions(call, bars);

    expect(result).toMatchObject({ stopSource: 'derived', stopRule: 'band_cross_s2', edgeMinutesOnly: false, between: null });
    expect(result.mae).toBeCloseTo(0.5);
    expect(result.mfe).toBeCloseTo(1.5);
    expect(result.maeR).toBeCloseTo(0.5);
    expect(result.mfeR).toBeCloseTo(1.5);
  });

  it('reads a put the other way: up is against it', () => {
    const result = underlyingExcursions(put, bars);

    expect(result.mae).toBeCloseTo(1.5);
    expect(result.mfe).toBeCloseTo(0.5);
  });

  it('gives points only, with no R, when there is no stop', () => {
    const result = underlyingExcursions({ ...call, underlyingStop: null, underlyingStopSource: null, underlyingStopRule: null }, bars);

    expect(result).toMatchObject({ maeR: null, mfeR: null, stopSource: null, stopRule: null });
    expect(result.mae).toBeCloseTo(0.5);
  });

  it('flags a trade under two minutes and also measures it without its fill and exit minutes', () => {
    const quick = { ...call, closedAt: new Date('2026-11-10T15:18:10Z') };

    const result = underlyingExcursions(quick, bars.slice(0, 3));

    expect(result.edgeMinutesOnly).toBe(true);
    // Only the 15:17 bar lies strictly between.
    expect(result.between.mae).toBeCloseTo(0.5);
    expect(result.between.mfe).toBeCloseTo(0.4);
    expect(result.between.maeR).toBeCloseTo(0.5);
  });

  it('leaves the between figures null for a quick trade with no bar strictly inside', () => {
    const quick = { ...call, closedAt: new Date('2026-11-10T15:17:30Z') };

    expect(underlyingExcursions(quick, bars.slice(0, 2))).toMatchObject({ edgeMinutesOnly: true, between: null });
  });

  it('has nothing to measure without the underlying entry or bars', () => {
    expect(underlyingExcursions({ ...call, underlyingEntry: null }, bars)).toBeNull();
    expect(underlyingExcursions(call, [])).toBeNull();
  });
});
