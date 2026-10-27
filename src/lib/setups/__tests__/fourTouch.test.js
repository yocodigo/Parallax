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
    // Lines through later touches of the shelf count bar 1 too, so bar 9 is a
    // 5th approach for every line.
    const bounced = withBars(breakout, {
      [B]: { o: 300.6, h: 305, l: 300.4, c: 304 },
      [B + 1]: { o: 304, h: 304.5, l: 292, c: 292.6 },
    });
    expect(fourTouchBreaks(bounced, B + 1)).toEqual([]);
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
    expect(fourTouchBreaks(straight, W + 7)[0]).toMatchObject({
      touches: [W + 1, W + 3, W + 5, W + 7],
      breakIndex: W + 7,
    });
  });

  it('waits for the first bar that comes back to the line, past bars that stay clear', () => {
    // After bar 6 moves away, bar 7 stays clear of the shelf, bar 8 comes back
    // within TOL, and bar 9 closes through.
    const gap = [
      ...breakout.slice(0, W + 7),
      { o: 301, h: 304, l: 301.5, c: 303 },
      { o: 303, h: 303.2, l: 300.4, c: 300.8 },
      { o: 300.8, h: 301, l: 292, c: 292.6 },
    ];
    const expected = { touches: [W + 1, W + 3, W + 5, W + 8], breakIndex: W + 9 };
    expect(fourTouchBreaks(gap, W + 9)[0]).toMatchObject({ kind: '4xBD', ...expected });
    expect(fourTouchBreaks(mirror(gap), W + 9)[0]).toMatchObject({ kind: '4xBO', ...expected });
  });

  it('skips a line that a bar closed through between its touches', () => {
    // Bar 5 closes at 300.3, under the shelf, between touches 2 and 3; the shelf
    // is touched again at bar 7 and broken at bar 10.
    const throughEarly = [
      ...breakout.slice(0, W + 5),
      { o: 305, h: 305, l: 300, c: 300.3 },
      { o: 300.3, h: 304, l: 301, c: 303.5 },
      { o: 303.5, h: 304, l: 300.5, c: 302 },
      { o: 302, h: 305, l: 301.5, c: 304.5 },
      { o: 304.5, h: 305, l: 300.6, c: 301 },
      { o: 301, h: 301.2, l: 290, c: 290.5 },
    ];
    const shelf = lineThrough({ index: W + 1, price: 300.5 }, { index: W + 3, price: 300.5 });
    expect(fourTouchBreaks(throughEarly, W + 10).map((found) => found.line)).not.toContainEqual(shelf);
  });

  it("counts touches before the line's first swing point, while the line held", () => {
    // Bar 0 ties bar 1 at 300.5, so neither is a swing low; the only line runs
    // through bars 3 and 5. It still counts bar 0, the shelf's first touch.
    const tied = withBars(breakout, { [W]: { o: 320, h: 322, l: 300.5, c: 314 } });
    expect(fourTouchBreaks(tied, B)[0]).toMatchObject({
      touches: [W, W + 3, W + 5, W + 7],
      breakIndex: B,
      line: lineThrough({ index: W + 3, price: 300.5 }, { index: W + 5, price: 300.2 }),
    });
  });

  it('counts touches back no further than the start of the trading day', () => {
    // The tied shelf again, with bar 0 at 3:59 PM one day and bar 1 at 9:30 the
    // next: the line through bars 3 and 5 starts counting at bar 1.
    const lastClose = Date.parse('2026-10-26T19:59:00Z');
    const nextOpen = Date.parse('2026-10-27T13:30:00Z');
    const at = (k) => (k <= W ? lastClose - (W - k) * 60_000 : nextOpen + (k - W - 1) * 60_000);
    const tied = withBars(breakout, { [W]: { o: 320, h: 322, l: 300.5, c: 314 } });
    const timed = tied.map((bar, k) => ({ ...bar, t: new Date(at(k)).toISOString() }));
    expect(fourTouchBreaks(timed, B)[0]).toMatchObject({ touches: [W + 1, W + 3, W + 5, W + 7], breakIndex: B });
  });

  it('stops counting back at a close through the line', () => {
    // Bar 0 touches the shelf and bar 2 closes through it. The shelf forms again
    // with touches at 5, 7, and 9, and breaks on its 4th approach at bar 12.
    // Counting bar 0 would make the line look broken between its touches.
    const reformed = [
      ...breakout.slice(0, W),
      { o: 320, h: 321, l: 300.5, c: 303 },
      { o: 303, h: 310, l: 302, c: 308 },
      { o: 308, h: 308.5, l: 298, c: 299 },
      { o: 299, h: 309, l: 298, c: 308 },
      { o: 308, h: 311, l: 303, c: 309 },
      { o: 309, h: 309.5, l: 300.5, c: 303 },
      { o: 303, h: 310, l: 302, c: 308 },
      { o: 308, h: 309, l: 300.5, c: 302 },
      { o: 302, h: 306, l: 301, c: 305 },
      { o: 305, h: 305, l: 300.4, c: 301 },
      { o: 301, h: 303, l: 300.6, c: 302 },
      { o: 302, h: 302, l: 300.3, c: 300.7 },
      { o: 300.7, h: 300.9, l: 292, c: 292.5 },
    ];
    expect(fourTouchBreaks(reformed, W + 12)[0]).toMatchObject({
      touches: [W + 5, W + 7, W + 9, W + 11],
      breakIndex: W + 12,
      line: lineThrough({ index: W + 5, price: 300.5 }, { index: W + 7, price: 300.5 }),
    });
  });

  it('takes a bar that spikes away from the line and closes through it as the break', () => {
    // Bar 8 trades 2.5 above the shelf before closing at 292.6.
    const spike = withBars(breakout, { [B]: { o: 301, h: 303, l: 292, c: 292.6 } });
    expect(fourTouchBreaks(spike, B)[0]).toMatchObject({ breakIndex: B });
  });

  it('draws no line through the 4th approach itself', () => {
    // Bars 4 and 6 tie bars 3 and 5, so the only swing lows on the shelf are
    // bar 1 and bar 7, where the 4th approach starts; an inside bar 8 confirms
    // bar 7, and bar 9 breaks. A line through bars 1 and 7 didn't exist yet
    // when the 4th approach began.
    const fitted = [
      ...withBars(breakout.slice(0, B), {
        [W + 4]: { o: 302, h: 306, l: 300.5, c: 305 },
        [W + 6]: { o: 301, h: 303, l: 300.2, c: 301 },
      }),
      { o: 300.6, h: 301, l: 300.3, c: 300.7 },
      { o: 300.7, h: 300.8, l: 292, c: 292.6 },
    ];
    expect(fourTouchBreaks(fitted, B + 1)).toEqual([]);
  });

  it("allows a line whose swing point is confirmed by the 4th approach's first bar", () => {
    // Bar 4 ties bar 3 and bars 5 and 7 sit above bar 6, so the only swing lows
    // are bars 1 and 6. Bar 7, where the 4th approach starts, confirms bar 6.
    const justInTime = withBars(breakout, {
      [W + 4]: { o: 302, h: 306, l: 300.5, c: 305 },
      [W + 5]: { o: 305, h: 305, l: 300.4, c: 301 },
      [W + 7]: { o: 301, h: 302, l: 300.4, c: 300.6 },
    });
    expect(fourTouchBreaks(justInTime, B)[0]).toMatchObject({
      breakIndex: B,
      line: lineThrough({ index: W + 1, price: 300.5 }, { index: W + 6, price: 300.3 }),
    });
  });

  it('draws no line through the 4th approach even when the break confirms it', () => {
    // A rising line through bars 1 and 10, where bar 10 starts the 4th approach
    // and only the break bar 11's higher low makes it a swing low.
    const rising = [
      ...breakout.slice(0, W + 1),
      { o: 314, h: 316, l: 300, c: 303 },
      { o: 303, h: 310, l: 302, c: 308 },
      { o: 308, h: 309, l: 304, c: 305 },
      { o: 305, h: 306, l: 303, c: 304 },
      { o: 304, h: 309, l: 303, c: 308 },
      { o: 308, h: 312, l: 307, c: 311 },
      { o: 311, h: 312, l: 306, c: 307 },
      { o: 307, h: 313, l: 306, c: 312 },
      { o: 312, h: 315, l: 310, c: 314 },
      { o: 314, h: 315, l: 309, c: 310 },
      { o: 310, h: 310.5, l: 309.2, c: 309.4 },
    ];
    expect(fourTouchBreaks(rising, W + 11)).toEqual([]);
  });

  it('finds the 4xBO at resistance the same way', () => {
    expect(fourTouchBreaks(mirror(breakout), B + 3)[0]).toMatchObject({ kind: '4xBO', status: 'valid' });
    expect(fourTouchBreaks(mirror(trap), B + 1)[0]).toMatchObject({
      kind: '4xBO',
      status: 'trap',
      trade: { side: 'short', entry: -302, stop: -292 },
    });
  });

  it('calls a break a trap when any line that found it saw a reclaim', () => {
    // Bar 9 closes at 300.2: still under the flat shelf, but back above the
    // slightly falling line through bars 1 and 5, which both found the break.
    const split = withBars(breakout, { [B + 1]: { o: 292.6, h: 300.4, l: 289, c: 300.2 } });
    expect(fourTouchBreaks(split, B + 3)).toMatchObject([
      {
        status: 'trap',
        line: lineThrough({ index: W + 1, price: 300.5 }, { index: W + 5, price: 300.2 }),
        trade: { side: 'long', entry: 300.2, stop: 289 },
      },
    ]);
  });

  it('otherwise reports the break with the line through the earliest swing points', () => {
    const [found] = fourTouchBreaks(breakout, B + 3);
    expect(found.line).toEqual(lineThrough({ index: W + 1, price: 300.5 }, { index: W + 3, price: 300.5 }));
  });

  it('reports each break once, though several swing pairs draw near-identical lines', () => {
    expect(fourTouchBreaks(breakout, B + 3).filter((found) => found.breakIndex === B)).toHaveLength(1);
  });

  it('ignores bars after i', () => {
    expect(fourTouchBreaks(trap, B)).toEqual(fourTouchBreaks(trap.slice(0, B + 1), B));
  });
});
