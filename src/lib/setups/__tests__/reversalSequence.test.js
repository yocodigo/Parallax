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

  it('finds nothing when the bar after the sweep fails to reclaim the pool', () => {
    const bars = withBars(reversalBars(), {
      [DISPLACEMENT]: { o: 97.6, h: 97.8, l: 97.4, c: 97.5 },
    });
    expect(reversalSequences(bars, AFTER)).toEqual([]);
  });

  it('finds nothing without a pool to sweep in the first place', () => {
    const bars = withBars(reversalBars(), { 48: baseline });
    expect(reversalSequences(bars, AFTER)).toEqual([]);
  });
});
