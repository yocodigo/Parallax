import { describe, expect, it } from 'vitest';
import { pools } from '../pools';

const bar = (o, h, l, c) => ({ o, h, l, c });
const flat = (n) => Array.from({ length: n }, () => bar(10, 10.5, 9.5, 10));

describe('pools', () => {
  it('groups two lows within TOL of each other into a sellside pool', () => {
    const bars = flat(20);
    const swingList = [
      { index: 14, kind: 'low', price: 112.0 },
      { index: 19, kind: 'low', price: 112.08 },
    ];
    expect(pools(bars, swingList)).toEqual([{ side: 'support', low: 112.0, high: 112.08, touches: [14, 19] }]);
  });

  it('groups two highs within TOL of each other into a buyside pool', () => {
    const bars = flat(20);
    const swingList = [
      { index: 14, kind: 'high', price: 120.0 },
      { index: 19, kind: 'high', price: 119.95 },
    ];
    expect(pools(bars, swingList)).toEqual([{ side: 'resistance', low: 119.95, high: 120.0, touches: [14, 19] }]);
  });

  it('keeps lows beyond TOL of each other apart: no pool', () => {
    const bars = flat(20);
    const swingList = [
      { index: 14, kind: 'low', price: 112.0 },
      { index: 19, kind: 'low', price: 112.5 },
    ];
    expect(pools(bars, swingList)).toEqual([]);
  });

  it('needs at least two swing points at the same level', () => {
    const bars = flat(20);
    const swingList = [{ index: 14, kind: 'low', price: 112.0 }];
    expect(pools(bars, swingList)).toEqual([]);
  });

  it('never pairs a low with a high', () => {
    const bars = flat(20);
    const swingList = [
      { index: 14, kind: 'low', price: 112.0 },
      { index: 19, kind: 'high', price: 112.05 },
    ];
    expect(pools(bars, swingList)).toEqual([]);
  });

  it('is empty without enough bars for the ATR', () => {
    const bars = flat(10);
    const swingList = [
      { index: 5, kind: 'low', price: 112.0 },
      { index: 9, kind: 'low', price: 112.05 },
    ];
    expect(pools(bars, swingList)).toEqual([]);
  });

  it('groups three equal lows into one pool rather than pairing them off', () => {
    const bars = flat(25);
    const swingList = [
      { index: 14, kind: 'low', price: 112.0 },
      { index: 19, kind: 'low', price: 112.04 },
      { index: 24, kind: 'low', price: 112.08 },
    ];
    expect(pools(bars, swingList)).toEqual([{ side: 'support', low: 112.0, high: 112.08, touches: [14, 19, 24] }]);
  });
});
