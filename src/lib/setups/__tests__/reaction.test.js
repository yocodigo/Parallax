import { describe, expect, it } from 'vitest';
import { reactionAt } from '../reaction';

const bar = (o, h, l, c) => ({ o, h, l, c });
const mirror = (bars) => bars.map(({ o, h, l, c }) => ({ o: -o, h: -l, l: -h, c: -c }));
// Twenty quiet bars below the 100 level: ranges of 1 (so the ATR is about 1)
// and bodies of 0.2 (so a body of 0.7 or more is a displacement).
const warmUp = Array.from({ length: 20 }, (_, k) => (k % 2 ? bar(98.2, 98.7, 97.7, 98) : bar(98, 98.5, 97.5, 98.2)));
const W = warmUp.length;
// The bar that reaches the level from below, closing under it.
const touch = bar(98.1, 100, 98, 99.8);
const at = (...bars) => [...warmUp, ...bars];

describe('reactionAt', () => {
  it('is null until a bar reaches the level', () => {
    expect(reactionAt(warmUp, 100, 'long', 0, W - 1)).toBeNull();
  });

  it('is rejected by a close at least half an ATR back within 3 bars of the touch', () => {
    const bars = at(touch, bar(99.8, 99.9, 99.2, 99.3));
    expect(reactionAt(bars, 100, 'long', W, W + 1)).toEqual({ kind: 'rejected', touchIndex: W, decidedAt: W + 1 });
  });

  it('counts the touch bar itself closing back as a rejection', () => {
    const bars = at(bar(98.8, 100, 98.7, 99.3));
    expect(reactionAt(bars, 100, 'long', W, W)).toMatchObject({ kind: 'rejected', decidedAt: W });
  });

  it('rips through on a displacement close beyond the level that holds for 3 bars', () => {
    const bars = at(
      touch,
      bar(99.8, 101.6, 99.7, 101.5),
      bar(101.5, 101.9, 101.3, 101.8),
      bar(101.8, 102, 101.5, 101.7),
      bar(101.7, 102.1, 101.4, 102)
    );
    expect(reactionAt(bars, 100, 'long', W, W + 3)).toEqual({ kind: null, touchIndex: W });
    expect(reactionAt(bars, 100, 'long', W, W + 4)).toEqual({ kind: 'ripped', touchIndex: W, decidedAt: W + 4 });
  });

  it('oscillates when closes switch sides of the level twice within 10 bars', () => {
    const bars = at(touch, bar(99.8, 100.4, 99.7, 100.3), bar(100.3, 100.4, 99.6, 99.7));
    expect(reactionAt(bars, 100, 'long', W, W + 2)).toEqual({
      kind: 'oscillating',
      touchIndex: W,
      decidedAt: W + 2,
      drifting: false,
    });
  });

  it('marks an oscillation drifting when the last close is beyond the level and past the touch close', () => {
    // Above (100.1), below, above again at 100.4.
    const bars = at(bar(99, 100.3, 98.9, 100.1), bar(100.1, 100.2, 99.7, 99.8), bar(99.8, 100.5, 99.7, 100.4));
    expect(reactionAt(bars, 100, 'long', W, W + 2)).toMatchObject({ kind: 'oscillating', drifting: true });
  });

  it('is not drifting when the last close is beyond the level but short of the touch close', () => {
    // Above (100.4), below, above again at only 100.2.
    const bars = at(bar(99, 100.5, 98.9, 100.4), bar(100.4, 100.5, 99.7, 99.8), bar(99.8, 100.3, 99.7, 100.2));
    expect(reactionAt(bars, 100, 'long', W, W + 2)).toMatchObject({ kind: 'oscillating', drifting: false });
  });

  it('calls it rejected when the same close is a rejection and the second crossing', () => {
    // Below, above, then far below: the second switch and a 0.7 drop together.
    const bars = at(touch, bar(99.8, 100.4, 99.7, 100.2), bar(100.2, 100.3, 99.2, 99.3));
    expect(reactionAt(bars, 100, 'long', W, W + 2)).toMatchObject({ kind: 'rejected', decidedAt: W + 2 });
  });

  it('gives up a rip that closes back, and keeps looking', () => {
    // A displacement close above, then a close back under the level: no rip,
    // and that close is the second crossing, so it oscillates.
    const bars = at(touch, bar(99.8, 101.6, 99.7, 101.5), bar(101.5, 101.6, 99.6, 99.7));
    expect(reactionAt(bars, 100, 'long', W, W + 2)).toMatchObject({ kind: 'oscillating', decidedAt: W + 2 });
  });

  it('is none when 10 bars pass with no reaction', () => {
    const hover = bar(99.6, 99.9, 99.5, 99.7);
    const bars = at(touch, ...Array(9).fill(hover));
    expect(reactionAt(bars, 100, 'long', W, W + 8)).toEqual({ kind: null, touchIndex: W });
    expect(reactionAt(bars, 100, 'long', W, W + 9)).toEqual({ kind: 'none', touchIndex: W, decidedAt: W + 9 });
  });

  it('works the same for a short target below', () => {
    const bars = mirror(at(touch, bar(99.8, 99.9, 99.2, 99.3)));
    expect(reactionAt(bars, -100, 'short', W, W + 1)).toMatchObject({ kind: 'rejected', decidedAt: W + 1 });
  });

  it('ignores bars after i', () => {
    const bars = at(touch, bar(99.8, 99.9, 99.6, 99.7), bar(99.7, 99.8, 99.2, 99.3));
    expect(reactionAt(bars, 100, 'long', W, W + 1)).toEqual({ kind: null, touchIndex: W });
  });
});
