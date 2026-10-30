import { describe, expect, it } from 'vitest';
import { reversalSequences } from '../reversalSequence';
import { AFTER, DISPLACEMENT, reversalBars, SWEEP } from './fixtures/reversalSequence';

const mirror = (bars) => bars.map(({ o, h, l, c }) => ({ o: -o, h: -l, l: -h, c: -c }));
const withBars = (bars, changes) => bars.map((bar, k) => changes[k] ?? bar);
const baseline = { o: 100, h: 100.5, l: 99.5, c: 100 };

describe('reversalSequences', () => {
  it('finds nothing before the gap behind the displacement bar exists', () => {
    expect(reversalSequences(reversalBars(), DISPLACEMENT)).toEqual([]);
  });

  it('finds the long sequence once the sweep, displacement, MSS, and gap all line up', () => {
    const bars = reversalBars();
    const [found] = reversalSequences(bars, AFTER);
    expect(found).toMatchObject({
      direction: 'long',
      pool: { side: 'support', low: 97.5, high: 97.56 },
      sweepIndex: SWEEP,
      displacementIndex: DISPLACEMENT,
      mssIndex: DISPLACEMENT,
      fvg: { side: 'bullish', ce: 101.25 },
      entry: 101.25,
      target: 103,
    });
    expect(found.stop).toBeCloseTo(96.8821, 4);
    expect(found.r).toBeCloseTo(0.4007, 4);
  });

  it('mirrors into a short sequence off a buyside pool', () => {
    const [found] = reversalSequences(mirror(reversalBars()), AFTER);
    expect(found).toMatchObject({
      direction: 'short',
      pool: { side: 'resistance', low: -97.56, high: -97.5 },
      fvg: { side: 'bearish', ce: -101.25 },
      entry: -101.25,
      target: -103,
    });
    expect(found.r).toBeCloseTo(0.4007, 4);
  });

  it('finds nothing without a pool ahead to target', () => {
    const bars = withBars(reversalBars(), { 28: baseline });
    expect(reversalSequences(bars, AFTER)).toEqual([]);
  });

  it('finds nothing when a displacement bar closes short of the pool, even with a big body', () => {
    const bars = withBars(reversalBars(), {
      // Body 3.5 against a lookback average near 0.26, well past DISP_MULT,
      // but the close (95.5) stays below the pool's high (97.56).
      [DISPLACEMENT]: { o: 99.0, h: 99.2, l: 95.0, c: 95.5 },
    });
    expect(reversalSequences(bars, AFTER)).toEqual([]);
  });

  it('finds nothing without a pool to sweep in the first place', () => {
    const bars = withBars(reversalBars(), { 48: baseline });
    expect(reversalSequences(bars, AFTER)).toEqual([]);
  });

  it('ignores a target touch that only became a confirmed swing after the sweep', () => {
    // Drops the target pool's second touch (28) and adds a near-sweep high
    // (64) that matches the first touch (20) in price but isn't confirmed
    // (SWING_K bars past it) until after the sweep bar (65) closes — too
    // late to have been known structure at the time.
    const bars = withBars(reversalBars(), {
      28: baseline,
      64: { o: 100, h: 103.05, l: 99.5, c: 100 },
      [DISPLACEMENT]: { o: 97.6, h: 103.0, l: 97.4, c: 103.0 },
    });
    expect(reversalSequences(bars, AFTER)).toEqual([]);
  });
});
