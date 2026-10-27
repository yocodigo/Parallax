import { describe, expect, it } from 'vitest';
import { findEntry } from '../entry';

const MINUTE = 60_000;
const T0 = Date.parse('2026-10-26T13:30:00Z');
const iso = (ms) => new Date(ms).toISOString();

// 15m bars: twenty closes at 10, then a close at 12 that crosses above the
// middle band (bar 20), then `after`.
const fifteens = (...after) =>
  [...Array(20).fill(10), 12, ...after].map((c, k) => ({ t: iso(T0 + k * 15 * MINUTE), o: c, h: c, l: c, c }));
// The crossing bar closes at the start of bar 21.
const CROSS_CLOSE = T0 + 21 * 15 * MINUTE;

// 5m bars starting `offset` minutes after the cross closed (negative: before).
const five = (offset, o, h, l, c, v = 100) => ({ t: iso(CROSS_CLOSE + offset * MINUTE), o, h, l, c, v });
const flat = (offset) => five(offset, 10.5, 11, 10, 10.5);
const longEntry = (offset, v) => five(offset, 11.1, 12.5, 10.9, 12.4, v);

describe('findEntry', () => {
  it('finds the first entry candle after the 15m cross, with its volume grade', () => {
    const bars5 = [flat(-5), flat(0), longEntry(5, 150), longEntry(10)];
    expect(findEntry(fifteens(), bars5, 20)).toEqual({ index: 2, bias: 'long', risingVolume: true });
  });

  it('counts an entry candle that starts the moment the cross closes', () => {
    expect(findEntry(fifteens(), [flat(-5), longEntry(0)], 20)).toMatchObject({ index: 1 });
  });

  it('ignores entry candles from before the cross closed', () => {
    const bars5 = [flat(-10), longEntry(-5), flat(0)];
    expect(findEntry(fifteens(), bars5, 20)).toBeNull();
  });

  it('keeps looking while the bias holds', () => {
    // The next 15m close stays above the middle band.
    const bars5 = [flat(-5), flat(0), flat(5), flat(10), flat(15), longEntry(20)];
    expect(findEntry(fifteens(12.5), bars5, 20)).toMatchObject({ index: 5 });
  });

  it('stops once a 15m close flips the bias, including the 5m candle closing with it', () => {
    // Bar 21 closes at 9, below the middle band, at CROSS_CLOSE + 15 minutes.
    const lateEntry = [flat(-5), flat(0), flat(5), longEntry(10), longEntry(20)];
    expect(findEntry(fifteens(9), lateEntry, 20)).toBeNull();
    const inTime = [flat(-5), flat(0), longEntry(5)];
    expect(findEntry(fifteens(9), inTime, 20)).toMatchObject({ index: 2 });
  });

  it('also stops when a later 15m close lands on the middle band', () => {
    // With bar 21 at 192 / 19, its close is its own middle band: no bias.
    expect(findEntry(fifteens(192 / 19), [flat(-5), flat(0), flat(5), longEntry(10)], 20)).toBeNull();
    expect(findEntry(fifteens(192 / 19), [flat(-5), flat(0), longEntry(5)], 20)).toMatchObject({ index: 2 });
  });

  it('stops at the session close rather than carrying into the next morning', () => {
    // The cross closes at 2:45 PM New York (18:45Z). Offsets are minutes after
    // that: 70 is 3:55 PM, 75 an after-hours bar starting at 4:00 PM, and 1125
    // is 9:30 AM the next day.
    expect(findEntry(fifteens(), [flat(-5), flat(0), longEntry(70)], 20)).toMatchObject({ index: 2 });
    expect(findEntry(fifteens(), [flat(-5), flat(0), flat(75), longEntry(1125)], 20)).toBeNull();
  });

  it('is null for a 15m bar that did not cross', () => {
    expect(findEntry(fifteens(12.5), [flat(10), longEntry(15)], 21)).toBeNull();
  });
});
