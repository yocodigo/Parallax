import { describe, expect, it } from 'vitest';
import { fourTouchBreaks } from '../fourTouch';
import { lineThrough } from '../trendline';
import { breakout, trap, W } from './fixtures/fourTouch';

const mirror = (bars) => bars.map(({ o, h, l, c }) => ({ o: -o, h: -l, l: -h, c: -c }));
// Bar 8 closes through the shelf in both sequences.
const B = W + 8;
// Replaces bars by index: { [k]: bar }.
const withBars = (bars, changes) => bars.map((bar, k) => changes[k] ?? bar);

describe('fourTouchBreaks', () => {
  it('finds nothing before the break', () => {
    expect(fourTouchBreaks(breakout, W + 7)).toEqual([]);
  });

  it('finds the 4xBD on the 4th approach, pending until the outcome is known', () => {
    const [found] = fourTouchBreaks(breakout, B);
    expect(found).toMatchObject({
      kind: '4xBD',
      touches: [W + 1, W + 3, W + 5, W + 7],
      breakIndex: B,
      displacement: true,
      status: 'pending',
    });
  });

  it('is valid once the forceful break is accepted and the reclaim window passes', () => {
    const found = fourTouchBreaks(breakout, B + 3);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: '4xBD',
      status: 'valid',
      outcome: { status: 'confirmed', acceptedAt: B + 2 },
    });
  });

  it('is a trap when the break is reclaimed, with the trade the other way', () => {
    const [found] = fourTouchBreaks(trap, B + 1);
    // Long on the reclaim close, stopped below the false break's low.
    expect(found).toMatchObject({ kind: '4xBD', status: 'trap', trade: { side: 'long', entry: 302, stop: 292 } });
  });

  it('is weak when the break lacks a 4x body, even if accepted', () => {
    // A body of 1.6 against the 1.85 average.
    const soft = breakout.map((bar, k) => (k === B ? { o: 300.6, h: 300.8, l: 298.5, c: 299 } : bar));
    expect(fourTouchBreaks(soft, B + 3)[0]).toMatchObject({ displacement: false, status: 'weak' });
  });

  it('calls a reclaimed break a trap even without a 4x body', () => {
    const softTrap = withBars(trap, { [B]: { o: 300.6, h: 301, l: 298.5, c: 299 } });
    expect(fourTouchBreaks(softTrap, B + 1)[0]).toMatchObject({ displacement: false, status: 'trap' });
  });

  it('needs three touches before the break: one on the 3rd approach is not a 4x', () => {
    // Bar 6 closes through right after touch 3.
    const early = withBars(breakout, { [W + 6]: { o: 301, h: 301.5, l: 293, c: 293.5 } });
    expect(fourTouchBreaks(early, W + 6)).toEqual([]);
  });

  it('ignores a break that comes after price moved away from the line again', () => {
    // Bar 8 bounces 4.5 off the shelf, ending its 4th approach; bar 9 breaks.
    // The falling line through bars 3 and 5 counts touches from bar 3, so bar
    // 9 is its own 4th approach; only the shelf is checked here.
    const bounced = withBars(breakout, {
      [B]: { o: 300.6, h: 305, l: 300.4, c: 304 },
      [B + 1]: { o: 304, h: 304.5, l: 292, c: 292.6 },
    });
    expect(fourTouchBreaks(bounced, B + 1).filter((found) => found.line.slope === 0)).toEqual([]);
  });

  it('skips a line that a bar closed through before the 4th touch', () => {
    // Bar 6 closes at 300.3, under the flat shelf but above the slightly
    // falling line through bars 1 and 5, so that line finds the break.
    const dented = withBars(breakout, { [W + 6]: { o: 301, h: 303, l: 300.25, c: 300.3 } });
    const [found] = fourTouchBreaks(dented, B);
    expect(found.line).toEqual(lineThrough({ index: W + 1, price: 300.5 }, { index: W + 5, price: 300.2 }));
  });

  it('never draws the line through a swing point that formed after the break', () => {
    // Bars 4 and 6 tie bars 3 and 5, so only bar 1 is a swing low on the shelf
    // before the break. Price later returns to 300.5 and makes a swing low at
    // bar 13, which a line through bars 1 and 13 would need.
    const late = [
      ...withBars(trap, {
        [W + 4]: { o: 302, h: 306, l: 300.5, c: 305 },
        [W + 6]: { o: 301, h: 303, l: 300.2, c: 301 },
      }),
      { o: 318, h: 319, l: 305, c: 306 },
      { o: 306, h: 307, l: 300.5, c: 302 },
      { o: 302, h: 308, l: 301, c: 307 },
    ];
    expect(fourTouchBreaks(late, W + 14)).toEqual([]);
  });

  it('starts the 4th approach at the first bar back at the line, which can itself break it', () => {
    // Bars 1, 3, and 5 sit on 300.5; bar 6 moves away; bar 7 comes back within
    // TOL and closes at 300.2, through the line, without touching it first.
    const straight = withBars(breakout, {
      [W + 5]: { o: 305, h: 305, l: 300.5, c: 301 },
      [W + 6]: { o: 301, h: 303, l: 300.8, c: 301 },
      [W + 7]: { o: 301, h: 302, l: 300.1, c: 300.2 },
    });
    expect(fourTouchBreaks(straight, W + 7)[0]).toMatchObject({ touches: [W + 1, W + 3, W + 5, W + 7], breakIndex: W + 7 });
  });

  it('takes a bar that spikes away from the line and closes through it as the break', () => {
    // Bar 8 trades 2.5 above the shelf before closing at 292.6.
    const spike = withBars(breakout, { [B]: { o: 301, h: 303, l: 292, c: 292.6 } });
    expect(fourTouchBreaks(spike, B)[0]).toMatchObject({ breakIndex: B });
  });

  it('finds the 4xBO at resistance the same way', () => {
    expect(fourTouchBreaks(mirror(breakout), B + 3)[0]).toMatchObject({ kind: '4xBO', status: 'valid' });
    expect(fourTouchBreaks(mirror(trap), B + 1)[0]).toMatchObject({
      kind: '4xBO',
      status: 'trap',
      trade: { side: 'short', entry: -302, stop: -292 },
    });
  });

  it('reports each break once, though several swing pairs draw near-identical lines', () => {
    expect(fourTouchBreaks(breakout, B + 3).filter((found) => found.breakIndex === B)).toHaveLength(1);
  });

  it('ignores bars after i', () => {
    expect(fourTouchBreaks(trap, B)).toEqual(fourTouchBreaks(trap.slice(0, B + 1), B));
  });
});
