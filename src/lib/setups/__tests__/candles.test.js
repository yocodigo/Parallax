import { describe, expect, it } from 'vitest';
import { barType, closeLocation, hasLittleOverlap, overlap } from '../candles';

// Bars use Alpaca's keys: o, h, l, c (and v for volume).
const bar = (h, l, extra = {}) => ({ h, l, ...extra });
const prev = bar(10, 5);

describe('barType', () => {
  it('is up when the high is higher and the low holds', () => {
    expect(barType(bar(11, 6), prev)).toBe('up');
    expect(barType(bar(11, 5), prev)).toBe('up');
  });

  it('is down when the low is lower and the high holds', () => {
    expect(barType(bar(9, 4), prev)).toBe('down');
    expect(barType(bar(10, 4), prev)).toBe('down');
  });

  it('is inside when neither extreme is exceeded, equal ones included', () => {
    expect(barType(bar(9, 6), prev)).toBe('inside');
    expect(barType(bar(10, 5), prev)).toBe('inside');
  });

  it('is outside when both extremes are exceeded', () => {
    expect(barType(bar(11, 4), prev)).toBe('outside');
  });
});

describe('closeLocation', () => {
  it('is where the close sits in the range, 0 at the low and 1 at the high', () => {
    expect(closeLocation(bar(10, 5, { c: 5 }))).toBe(0);
    expect(closeLocation(bar(10, 5, { c: 10 }))).toBe(1);
    expect(closeLocation(bar(10, 6, { c: 9 }))).toBe(0.75);
  });

  it('is null for a bar with no range', () => {
    expect(closeLocation(bar(5, 5, { c: 5 }))).toBeNull();
  });
});

describe('overlap', () => {
  it('is the share of the bar’s range that the previous bar also covered', () => {
    expect(overlap(bar(12, 8), prev)).toBe(0.5);
    expect(overlap(bar(9, 6), prev)).toBe(1);
  });

  it('is 0 when the bars don’t meet', () => {
    expect(overlap(bar(14, 11), prev)).toBe(0);
  });

  it('is null for a bar with no range', () => {
    expect(overlap(bar(7, 7), prev)).toBeNull();
  });
});

describe('hasLittleOverlap', () => {
  it('allows up to 25% overlap by default', () => {
    expect(hasLittleOverlap(bar(13, 9), prev)).toBe(true); // 1 of 4
    expect(hasLittleOverlap(bar(12, 8), prev)).toBe(false); // 2 of 4
  });

  it('takes another limit', () => {
    expect(hasLittleOverlap(bar(12, 8), prev, 0.5)).toBe(true);
  });

  it('is false for a bar with no range', () => {
    expect(hasLittleOverlap(bar(7, 7), prev)).toBe(false);
  });
});
