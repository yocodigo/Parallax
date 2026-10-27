import { describe, expect, it } from 'vitest';
import { bollinger } from '../bollinger';

const closes = (values) => values.map((c) => ({ c }));

describe('bollinger', () => {
  it('puts the bands 2 standard deviations around the 20-bar average close', () => {
    // Alternating 9 and 11: average 10, standard deviation exactly 1.
    const bars = closes(Array.from({ length: 20 }, (_, i) => (i % 2 ? 11 : 9)));
    expect(bollinger(bars, 19)).toEqual({ middle: 10, upper: 12, lower: 8 });
  });

  it('includes bar i, which has closed, and ignores bars after it', () => {
    const bars = closes([...Array(19).fill(10), 30, 1000]);
    expect(bollinger(bars, 19).middle).toBe(11);
  });

  it('takes another period and width', () => {
    const bars = closes([9, 11, 9, 11]);
    expect(bollinger(bars, 3, { period: 4, deviations: 1 })).toEqual({ middle: 10, upper: 11, lower: 9 });
  });

  it('is null without 20 bars ending at i', () => {
    expect(bollinger(closes(Array(19).fill(10)), 18)).toBeNull();
  });
});
