import { describe, expect, it } from 'vitest';
import { EDGE_MINUTES_HOLD, edgeSplit } from '../tradeWindow';

// One bar a minute from 15:16 to 15:20.
const bars = [16, 17, 18, 19, 20].map((m) => ({ t: `2026-11-10T15:${m}:00Z` }));
const at = (time) => new Date(`2026-11-10T15:${time}Z`);

describe('edgeSplit', () => {
  it('flags a trade held under EDGE_MINUTES_HOLD minutes, whose window is mostly its edge minutes', () => {
    expect(EDGE_MINUTES_HOLD).toBe(2);
    expect(edgeSplit(bars, at('16:37'), at('17:30')).edgeMinutesOnly).toBe(true);
    expect(edgeSplit(bars, at('16:37'), at('18:37')).edgeMinutesOnly).toBe(false);
  });

  it('keeps the bars strictly between the fill minute and the exit minute', () => {
    expect(edgeSplit(bars, at('16:50'), at('18:10')).between.map((b) => b.t)).toEqual(['2026-11-10T15:17:00Z']);
  });

  it('has no between bars when the fill and exit minutes touch', () => {
    expect(edgeSplit(bars, at('16:37'), at('17:30')).between).toEqual([]);
  });

  it('runs an open trade to the last bar, never edge-only', () => {
    const split = edgeSplit(bars, at('16:37'), null);
    expect(split.edgeMinutesOnly).toBe(false);
    expect(split.between.map((b) => b.t)).toEqual(['2026-11-10T15:17:00Z', '2026-11-10T15:18:00Z', '2026-11-10T15:19:00Z', '2026-11-10T15:20:00Z']);
  });
});
