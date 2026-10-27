import { describe, expect, it } from 'vitest';
import { resample } from '../resample';

// A minute bar starting at `time` (UTC). On 2026-10-26 New York is on EDT, so
// the 9:30 AM open is 13:30Z.
const minute = (time, o, h, l, c, v = 100) => ({ t: `2026-10-26T${time}:00Z`, o, h, l, c, v });

describe('resample', () => {
  it('combines minute bars into longer bars: first open, highest high, lowest low, last close, total volume', () => {
    const bars = [
      minute('13:30', 10, 11, 9.5, 10.5),
      minute('13:31', 10.5, 12, 10, 11),
      minute('13:32', 11, 11.5, 9, 9.8),
      minute('13:33', 9.8, 10, 9.6, 9.9),
      minute('13:34', 9.9, 10.2, 9.7, 10.1, 50),
    ];
    expect(resample(bars, 5)).toEqual([{ t: '2026-10-26T13:30:00.000Z', o: 10, h: 12, l: 9, c: 10.1, v: 450 }]);
  });

  it('lines the bars up with the clock, so 15m bars start at the 9:30 open', () => {
    const bars = ['13:30', '13:44', '13:45', '13:59'].map((time) => minute(time, 1, 1, 1, 1));
    expect(resample(bars, 15).map((bar) => bar.t)).toEqual(['2026-10-26T13:30:00.000Z', '2026-10-26T13:45:00.000Z']);
  });

  it('leaves out the last bar until its period has ended', () => {
    const bars = ['13:30', '13:34', '13:35', '13:37'].map((time) => minute(time, 1, 1, 1, 1));
    // The 13:35 bar runs to 13:40, but the minutes only reach 13:38.
    expect(resample(bars, 5).map((bar) => bar.t)).toEqual(['2026-10-26T13:30:00.000Z']);
  });

  it('keeps the last bar once its final minute is in, or once asOf passes its end', () => {
    const upTo39 = ['13:35', '13:39'].map((time) => minute(time, 1, 1, 1, 1));
    expect(resample(upTo39, 5)).toHaveLength(1);

    const upTo37 = ['13:35', '13:37'].map((time) => minute(time, 1, 1, 1, 1));
    expect(resample(upTo37, 5, { asOf: new Date('2026-10-26T13:40:00Z') })).toHaveLength(1);
    expect(resample(upTo37, 5, { asOf: new Date('2026-10-26T13:39:59Z') })).toHaveLength(0);
  });

  it('builds a bar from whatever minutes traded in it', () => {
    // No trades in 13:31-13:33, as happens on the IEX feed.
    const bars = [minute('13:30', 10, 10.5, 9.9, 10.2), minute('13:34', 10.2, 10.8, 10.1, 10.7), minute('13:35', 1, 1, 1, 1)];
    expect(resample(bars, 5)[0]).toEqual({ t: '2026-10-26T13:30:00.000Z', o: 10, h: 10.8, l: 9.9, c: 10.7, v: 200 });
  });

  it('returns nothing for no bars', () => {
    expect(resample([], 15)).toEqual([]);
  });
});
