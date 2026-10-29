import { describe, expect, it } from 'vitest';
import { bosOutcome, isMSS } from '../structure';

const bar = (o, h, l, c) => ({ o, h, l, c });
// Ten flat bars (body 1), all closing inside a resistance swing at 11.2.
const flat = (n = 10) => Array.from({ length: n }, () => bar(10, 11.2, 9.8, 11));

describe('isMSS', () => {
  const highSwing = { index: 0, kind: 'high', price: 100 };
  const lowSwing = { index: 0, kind: 'low', price: 100 };

  it('is true when the body closes beyond a lower high', () => {
    expect(isMSS([bar(99, 101, 98, 101)], highSwing, 0)).toBe(true);
  });

  it('is false when the close stays at or below the swing high', () => {
    expect(isMSS([bar(99, 100.5, 98, 100)], highSwing, 0)).toBe(false);
    expect(isMSS([bar(99, 100.5, 98, 99.5)], highSwing, 0)).toBe(false);
  });

  it('is true when the body closes beyond a higher low', () => {
    expect(isMSS([bar(101, 102, 99, 99)], lowSwing, 0)).toBe(true);
  });

  it('is false when the close stays at or above the swing low', () => {
    expect(isMSS([bar(101, 102, 99.5, 100)], lowSwing, 0)).toBe(false);
  });
});

describe('bosOutcome', () => {
  const resistance = { index: 0, kind: 'high', price: 11.2 };

  it('is a BOS once the break bar shows displacement and the close holds past the reclaim window', () => {
    const bars = [
      ...flat(),
      bar(11, 14, 10.9, 13.9), // break bar: displacement, closes beyond 11.2
      bar(13.9, 15, 13.5, 14.5),
      bar(14.5, 15, 13.5, 14.5),
      bar(14.5, 15, 13.5, 14.5),
    ];
    expect(bosOutcome(bars, resistance, 10, 13)).toMatchObject({ status: 'bos' });
  });

  it('is pending until the acceptance window has had time to close', () => {
    const bars = [...flat(), bar(11, 14, 10.9, 13.9), bar(13.9, 15, 13.5, 14.5)];
    expect(bosOutcome(bars, resistance, 10, 11)).toMatchObject({ status: 'pending' });
  });

  it('is a drift when the break bar lacks displacement, even once it would otherwise be accepted', () => {
    const bars = [
      ...flat(),
      bar(11, 11.3, 10.9, 11.25), // no displacement: body 0.25 against an average body of 1
      bar(11.25, 11.4, 11.2, 11.3),
      bar(11.3, 11.4, 11.2, 11.3),
      bar(11.3, 11.4, 11.2, 11.3),
    ];
    expect(bosOutcome(bars, resistance, 10, 13)).toMatchObject({ status: 'drift' });
  });

  it('is reclaimed when price closes back inside before the acceptance window passes, even with displacement', () => {
    const bars = [...flat(), bar(11, 14, 10.9, 13.9), bar(13.9, 14, 10.9, 11.0)];
    expect(bosOutcome(bars, resistance, 10, 11)).toMatchObject({ status: 'reclaimed' });
  });
});
