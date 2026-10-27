import { describe, expect, it } from 'vitest';
import { fourTouchBreaks, fourTouchGrade } from '../fourTouch';
import { breakout, W } from './fixtures/fourTouch';

const mirror = (bars) => bars.map(({ o, h, l, c }) => ({ o: -o, h: -l, l: -h, c: -c }));
const TOUCHES = [W + 1, W + 3, W + 5, W + 7];

// Bars at touch indices, with `high` on every bar between touches.
const spaced = (touches, high = () => 10) =>
  Array.from({ length: touches.at(-1) + 1 }, (_, k) => ({ o: 5, h: high(k), l: 1, c: 5 }));

describe('fourTouchGrade', () => {
  it('grades the example A: lower highs between its evenly spaced touches', () => {
    // The highs between touches are 310, 306, and 303; the gaps are 2, 2, 2.
    expect(fourTouchGrade(breakout, TOUCHES, 'support')).toEqual({ grade: 'A', compression: true, spacing: true });
  });

  it('grades B without compression, even with good spacing', () => {
    // A high of 311 between touches 2 and 3 breaks the lower highs.
    const loose = breakout.map((bar, k) => (k === W + 4 ? { ...bar, h: 311 } : bar));
    expect(fourTouchGrade(loose, TOUCHES, 'support')).toEqual({ grade: 'B', compression: false, spacing: true });
  });

  it('wants higher lows between touches for a breakout', () => {
    expect(fourTouchGrade(mirror(breakout), TOUCHES, 'resistance')).toMatchObject({ grade: 'A', compression: true });
  });

  it('grades B with uneven gaps and no two touches close together', () => {
    // Gaps 2, 2, 8: they vary by 71%, and none is a third of the 4 average.
    const touches = [0, 2, 4, 12];
    expect(fourTouchGrade(spaced(touches), touches, 'support')).toMatchObject({ grade: 'B', spacing: false });
  });

  it('counts two touches close together as good spacing', () => {
    // Gaps 6, 1, 6: uneven, but 1 is under a third of the 4.33 average.
    const touches = [0, 6, 7, 13];
    expect(fourTouchGrade(spaced(touches), touches, 'support')).toMatchObject({ spacing: true });
  });

  it('is part of each break the detector reports', () => {
    expect(fourTouchBreaks(breakout, W + 11)[0].grade).toEqual({ grade: 'A', compression: true, spacing: true });
  });
});
