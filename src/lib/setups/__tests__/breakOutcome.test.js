import { describe, expect, it } from 'vitest';
import { breakOutcome, lineThrough } from '../trendline';
import { breakout, trap, W } from './fixtures/fourTouch';

const mirror = (bars) => bars.map(({ o, h, l, c }) => ({ o: -o, h: -l, l: -h, c: -c }));
const shelf = lineThrough({ index: W + 1, price: 300.5 }, { index: W + 3, price: 300.5 });
// Bar 8 is the first close through the shelf in both sequences.
const B = W + 8;

describe('breakOutcome', () => {
  it('is pending until enough bars have closed', () => {
    expect(breakOutcome(breakout, shelf, 'support', B, B + 1)).toEqual({ status: 'pending', acceptedAt: null, reclaimedAt: null });
  });

  it('is accepted after two closes beyond, and confirmed once the reclaim window passes', () => {
    expect(breakOutcome(breakout, shelf, 'support', B, B + 2)).toEqual({ status: 'accepted', acceptedAt: B + 2, reclaimedAt: null });
    expect(breakOutcome(breakout, shelf, 'support', B, B + 3)).toEqual({ status: 'confirmed', acceptedAt: B + 2, reclaimedAt: null });
  });

  it('is reclaimed by a close back inside within three bars: the trap', () => {
    expect(breakOutcome(trap, shelf, 'support', B, B + 1)).toEqual({ status: 'reclaimed', acceptedAt: null, reclaimedAt: B + 1 });
  });

  it('reports no acceptance when any close it needed came back inside', () => {
    // The trap closes back above on bar 9, so bars 9 and 10 didn't both stay below.
    expect(breakOutcome(trap, shelf, 'support', B, B + 2)).toEqual({ status: 'reclaimed', acceptedAt: null, reclaimedAt: B + 1 });
    // Only the first close after the break comes back inside; the second holds.
    const reclaimOnFirst = breakout.map((bar, k) => (k === B + 1 ? { ...bar, h: 302, c: 301 } : bar));
    expect(breakOutcome(reclaimOnFirst, shelf, 'support', B, B + 2)).toEqual({ status: 'reclaimed', acceptedAt: null, reclaimedAt: B + 1 });
    // A reclaim on the last close acceptance needed leaves it unaccepted too.
    const reclaimOnSecond = breakout.map((bar, k) => (k === B + 2 ? { ...bar, h: 302, c: 301 } : bar));
    expect(breakOutcome(reclaimOnSecond, shelf, 'support', B, B + 2)).toEqual({ status: 'reclaimed', acceptedAt: null, reclaimedAt: B + 2 });
  });

  it('counts a reclaim even after acceptance, while the window is open', () => {
    const lateReclaim = breakout.map((bar, k) => (k === B + 3 ? { ...bar, h: 302, c: 301 } : bar));
    expect(breakOutcome(lateReclaim, shelf, 'support', B, B + 3)).toEqual({ status: 'reclaimed', acceptedAt: B + 2, reclaimedAt: B + 3 });
  });

  it('stays confirmed when a close comes back inside after the reclaim window', () => {
    // Bar 12 is four bars after the break, one past the window.
    const lateReturn = [...breakout, { o: 281, h: 302, l: 280, c: 301 }];
    expect(breakOutcome(lateReturn, shelf, 'support', B, B + 4)).toEqual({ status: 'confirmed', acceptedAt: B + 2, reclaimedAt: null });
  });

  it('ignores bars after the one it is judged at', () => {
    expect(breakOutcome(trap, shelf, 'support', B, B)).toEqual({ status: 'pending', acceptedAt: null, reclaimedAt: null });
  });

  it('works the same for resistance', () => {
    const roof = lineThrough({ index: W + 1, price: -300.5 }, { index: W + 3, price: -300.5 });
    expect(breakOutcome(mirror(trap), roof, 'resistance', B, B + 1).status).toBe('reclaimed');
    expect(breakOutcome(mirror(breakout), roof, 'resistance', B, B + 3).status).toBe('confirmed');
  });
});
