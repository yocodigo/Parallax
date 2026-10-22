import { describe, expect, it } from 'vitest';
import { barTimeframeFor, excursions } from '../excursions';

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
