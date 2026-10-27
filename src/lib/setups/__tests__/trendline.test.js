import { describe, expect, it } from 'vitest';
import { TRENDLINE_K } from '../settings';
import { swings } from '../swings';
import { isUnbroken, lineAt, lineThrough, lineTouches } from '../trendline';
import { breakout, W } from './fixtures/fourTouch';

// The mirror image: support becomes resistance at the negated price.
const mirror = (bars) => bars.map(({ o, h, l, c }) => ({ o: -o, h: -l, l: -h, c: -c }));
// The example's shelf: the line through the swing lows at bars 1 and 3.
const shelf = lineThrough({ index: W + 1, price: 300.5 }, { index: W + 3, price: 300.5 });

describe('lineThrough', () => {
  it('projects a line through two points, flat or sloped', () => {
    expect(lineAt(shelf, W + 10)).toBe(300.5);
    const rising = lineThrough({ index: 0, price: 10 }, { index: 4, price: 12 });
    expect(lineAt(rising, 6)).toBe(13);
  });
});

describe('the example shelf', () => {
  it('has swing lows at the first three touches with one bar on each side', () => {
    const lows = swings(breakout, W + 7, TRENDLINE_K).filter((s) => s.kind === 'low');
    expect(lows.map((s) => s.index)).toEqual(expect.arrayContaining([W + 1, W + 3, W + 5]));
  });
});

describe('lineTouches', () => {
  it('counts the four touches, with bar 6 merged into touch 3', () => {
    expect(lineTouches(breakout, shelf, 'support', W + 1, W + 7)).toEqual([W + 1, W + 3, W + 5, W + 7]);
  });

  it('merges bars at the line until one has moved away from it', () => {
    // Bar 6 is at the line right after touch 3, with no bar between them.
    expect(lineTouches(breakout, shelf, 'support', W + 1, W + 6)).toEqual([W + 1, W + 3, W + 5]);
  });

  it('works the same for resistance', () => {
    const roof = lineThrough({ index: W + 1, price: -300.5 }, { index: W + 3, price: -300.5 });
    expect(lineTouches(mirror(breakout), roof, 'resistance', W + 1, W + 7)).toEqual([W + 1, W + 3, W + 5, W + 7]);
  });

  it('counts every other bar of a run of wide bars at the line', () => {
    // Each bar's low sits on the shelf and its high reaches well past BOUNCE,
    // so each merged bar also counts as moving away.
    const wide = [...breakout.slice(0, W), ...Array(4).fill({ o: 303, h: 305, l: 300.5, c: 302 })];
    expect(lineTouches(wide, shelf, 'support', W, W + 3)).toEqual([W, W + 2]);
  });

  it('skips bars without enough history for the ATR', () => {
    const early = Array(5).fill({ o: 303, h: 305, l: 300.5, c: 302 });
    expect(lineTouches(early, shelf, 'support', 0, 4)).toEqual([]);
  });

  it('ignores bars after the end', () => {
    expect(lineTouches(breakout, shelf, 'support', W + 1, W + 5)).toEqual([W + 1, W + 3, W + 5]);
  });
});

describe('isUnbroken', () => {
  it('is true while no bar closes through the line, wicks included', () => {
    // Bars 5 and 7 trade below 300.5 but close above it.
    expect(isUnbroken(breakout, shelf, 'support', W + 1, W + 7)).toBe(true);
  });

  it('is false once a bar closes through', () => {
    expect(isUnbroken(breakout, shelf, 'support', W + 1, W + 8)).toBe(false);
  });

  it('works the same for resistance', () => {
    const roof = lineThrough({ index: W + 1, price: -300.5 }, { index: W + 3, price: -300.5 });
    expect(isUnbroken(mirror(breakout), roof, 'resistance', W + 1, W + 7)).toBe(true);
    expect(isUnbroken(mirror(breakout), roof, 'resistance', W + 1, W + 8)).toBe(false);
  });
});
