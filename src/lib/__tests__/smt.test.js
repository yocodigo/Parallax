import { describe, it, expect } from 'vitest';
import { smtDivergences } from '../smt';

// Rebased rows, as rebaseSeries makes them: percent change from the first bar.
const rows = (pairs) => pairs.map(([A, B], i) => ({ date: `d${i}`, A, B }));

describe('smtDivergences', () => {
  it('marks a bar where one makes a new window high and the other does not', () => {
    // A pushes above its earlier high (1) at d2; B stays under its own (2).
    const result = smtDivergences(rows([[0, 0], [1, 2], [1.5, 1.8]]), 'A', 'B');

    expect(result).toEqual([{ date: 'd2', kind: 'high', made: 'A', missed: 'B', value: 1.5 }]);
  });

  it('marks it on the other symbol when that is the one making the high', () => {
    const result = smtDivergences(rows([[0, 0], [2, 1], [1.8, 1.5]]), 'A', 'B');

    expect(result).toEqual([{ date: 'd2', kind: 'high', made: 'B', missed: 'A', value: 1.5 }]);
  });

  it('marks a bar where one makes a new window low and the other does not', () => {
    const result = smtDivergences(rows([[0, 0], [-1, -2], [-1.5, -1.8]]), 'A', 'B');

    expect(result).toEqual([{ date: 'd2', kind: 'low', made: 'A', missed: 'B', value: -1.5 }]);
  });

  it('marks nothing when both make the high or the low together, or neither does', () => {
    expect(smtDivergences(rows([[0, 0], [1, 1], [2, 2]]), 'A', 'B')).toEqual([]);
    expect(smtDivergences(rows([[0, 0], [-1, -1], [-2, -2]]), 'A', 'B')).toEqual([]);
    expect(smtDivergences(rows([[0, 0], [1, 1], [0.5, 0.5]]), 'A', 'B')).toEqual([]);
  });

  it('does not count equalling the earlier high as a new one', () => {
    // A only ties its high of 1 at d2, so neither made a new high.
    expect(smtDivergences(rows([[0, 0], [1, 1], [1, 0.5]]), 'A', 'B')).toEqual([]);
  });

  it("leaves out each symbol's first bar, which only starts its window", () => {
    expect(smtDivergences(rows([[0, 0]]), 'A', 'B')).toEqual([]);
  });

  it('compares each bar with the whole window before it, not just the bar before', () => {
    // B's high of 3 at d1 stands, so B's 2 and 2.5 are not new highs while A's
    // 1.5 and 2 are.
    const result = smtDivergences(rows([[0, 0], [1, 3], [1.5, 2], [2, 2.5]]), 'A', 'B');

    expect(result.map((r) => [r.date, r.kind, r.made])).toEqual([
      ['d2', 'high', 'A'],
      ['d3', 'high', 'A'],
    ]);
  });

  it("keeps a symbol's extremes through bars where only it has a value", () => {
    // A's 5 at d1 is a peak on the chart, so A's 1 at d2 is not a new high. B
    // making a new low at d2 is the only divergence.
    const data = [
      { date: 'd0', A: 0, B: 0 },
      { date: 'd1', A: 5 },
      { date: 'd2', A: 1, B: -1 },
    ];

    expect(smtDivergences(data, 'A', 'B')).toEqual([{ date: 'd2', kind: 'low', made: 'B', missed: 'A', value: -1 }]);
  });

  it('compares a symbol that starts later against its own history only', () => {
    // B starts at d1. At d2 B makes a new high; A's -1 is above its low of -2
    // but under its high of 0, so A made neither.
    const data = [
      { date: 'd0', A: 0 },
      { date: 'd1', A: -2, B: 0 },
      { date: 'd2', A: -1, B: 1 },
    ];

    expect(smtDivergences(data, 'A', 'B')).toEqual([{ date: 'd2', kind: 'high', made: 'B', missed: 'A', value: 1 }]);
  });
});
