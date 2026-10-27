import { describe, expect, it } from 'vitest';
import { bandCross } from '../direction';

const closes = (values) => values.map((c) => ({ c }));
// Twenty closes at 10, so the middle band starts at exactly 10, then `rest`.
const flatThen = (...rest) => closes([...Array(20).fill(10), ...rest]);

describe('bandCross', () => {
  it('is a long bias for a close above the middle band, marking the close that crossed', () => {
    // At bar 20 the middle is (19 × 10 + 12) / 20 = 10.1, and bar 19 sat on it.
    expect(bandCross(flatThen(12), 20)).toEqual({ bias: 'long', crossed: true, middle: 10.1 });
  });

  it('is a short bias for a close below it', () => {
    expect(bandCross(flatThen(8), 20)).toEqual({ bias: 'short', crossed: true, middle: 9.9 });
  });

  it('keeps the bias without a new cross while closes stay on the same side', () => {
    expect(bandCross(flatThen(12, 12.5), 21)).toMatchObject({ bias: 'long', crossed: false });
  });

  it('marks a cross from one side straight to the other', () => {
    // Middle at bar 22: (17 × 10 + 12 + 12.5 + 9) / 20 = 10.175, above the 9 close.
    expect(bandCross(flatThen(12, 12.5, 9), 22)).toMatchObject({ bias: 'short', crossed: true });
  });

  it('gives no bias for a close on the middle band, even when rounding puts it a hair off', () => {
    expect(bandCross(flatThen(), 19).bias).toBeNull();
    // Twenty closes of 761.10 average to 761.1000000000003.
    expect(bandCross(closes(Array(20).fill(761.1)), 19).bias).toBeNull();
  });

  it('marks no cross on the first bar with bands, since the one before has none', () => {
    expect(bandCross(closes([...Array(19).fill(10), 12]), 19)).toMatchObject({ bias: 'long', crossed: false });
  });

  it('ignores bars after i', () => {
    expect(bandCross(flatThen(12, 1000), 20)).toEqual(bandCross(flatThen(12), 20));
  });

  it('is null without 20 bars ending at i', () => {
    expect(bandCross(flatThen(), 18)).toBeNull();
  });
});
