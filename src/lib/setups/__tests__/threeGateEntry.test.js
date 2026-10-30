import { describe, expect, it } from 'vitest';
import { atr } from '../relative';
import { threeGateEntry } from '../threeGateEntry';

const bar = (o, h, l, c) => ({ o, h, l, c });
const mirror = (bars) => bars.map(({ o, h, l, c }) => ({ o: -o, h: -l, l: -h, c: -c }));

// Twenty quiet bars with no net swing (the highs and lows tie, so standsOut's
// strict inequality never fires): enough history for a real ATR without
// building any dealing range, so the mid-range gate stays out of the way.
const warmUp = Array.from({ length: 20 }, (_, k) => (k % 2 ? bar(98.2, 98.7, 97.7, 98) : bar(98, 98.5, 97.5, 98.2)));
const W = warmUp.length;
const at = (...bars) => [...warmUp, ...bars];

// Trades below the 100 support, closes back above it in the top half of its
// range: gate 1 (sweep) and gate 2 (rejection quality) both met.
const sweep = bar(99.8, 100.6, 99.0, 100.5);

describe('threeGateEntry', () => {
  it('is null with no sweep of the level', () => {
    expect(threeGateEntry(warmUp, 100, 'support', 0, W - 1)).toBeNull();
  });

  it('fires once the sweep, the rejection quality, and a trigger within 3 bars all line up', () => {
    const bars = at(sweep, bar(100.5, 100.8, 100.3, 100.7));
    const range = atr(bars, W);
    expect(threeGateEntry(bars, 100, 'support', W, W + 1)).toEqual({
      direction: 'long',
      sweepIndex: W,
      triggerIndex: W + 1,
      entry: 100.6,
      stop: 99.0 - 0.1 * range,
    });
  });

  it('mirrors into a short entry off a resistance sweep', () => {
    const bars = mirror(at(sweep, bar(100.5, 100.8, 100.3, 100.7)));
    const range = atr(bars, W);
    expect(threeGateEntry(bars, -100, 'resistance', W, W + 1)).toEqual({
      direction: 'short',
      sweepIndex: W,
      triggerIndex: W + 1,
      entry: -100.6,
      stop: -99.0 + 0.1 * range,
    });
  });

  it('is null while the trigger has not arrived yet, not a failure', () => {
    const bars = at(sweep, bar(100.5, 100.55, 100.3, 100.4));
    expect(threeGateEntry(bars, 100, 'support', W, W + 1)).toBeNull();
  });

  it('is null once the 3-bar trigger window passes without one', () => {
    const stall = bar(100.3, 100.55, 100.2, 100.4);
    const bars = at(sweep, stall, stall, stall);
    expect(threeGateEntry(bars, 100, 'support', W, W + 3)).toBeNull();
  });

  it('ignores a trigger that arrives after the 3-bar window closes', () => {
    const stall = bar(100.3, 100.55, 100.2, 100.4);
    const late = bar(100.4, 100.9, 100.3, 100.8); // beyond the sweep's high, but one bar too late
    const bars = at(sweep, stall, stall, stall, late);
    expect(threeGateEntry(bars, 100, 'support', W, W + 4)).toBeNull();
  });

  it('skips a close-back with a weak rejection but still catches a later good one', () => {
    const weak = bar(99.8, 101.6, 99.0, 100.1); // closes back above 100, but low in its own range (CL < 0.5)
    const good = bar(100.1, 100.9, 99.0, 100.8); // sweeps again, closes near its high
    const trigger = bar(100.8, 101.0, 100.7, 100.9);
    const bars = at(weak, good, trigger);
    expect(threeGateEntry(bars, 100, 'support', W, W + 2)).toMatchObject({
      sweepIndex: W + 1,
      triggerIndex: W + 2,
    });
  });

  it('is null when the level sits in the mid-range of the dealing range known as of the sweep', () => {
    // A swing low of 95 (bar 22) and a swing high of 105 (bar 26), confirmed
    // (SWING_K = 2 bars later) by the sweep bar: level 100 sits at the exact
    // midpoint, squarely inside the 40-60% no-trade band.
    const extra = [
      bar(100, 100.5, 99.8, 100.2),
      bar(99.9, 100.2, 99.6, 100.0),
      bar(99.5, 99.8, 95.0, 99.6), // swing low
      bar(99.6, 99.9, 99.6, 99.8),
      bar(99.8, 100.0, 99.9, 99.95),
      bar(99.95, 100.5, 99.9, 100.3),
      bar(100.3, 105.0, 100.2, 104.5), // swing high
      bar(104.4, 104.6, 100.0, 100.3),
      bar(100.3, 100.4, 100.1, 100.2),
      bar(100.2, 100.4, 100.1, 100.3),
      bar(100.5, 101.6, 99.0, 101.5), // sweep: below 100, closes back above near its high
    ];
    const bars = at(...extra);
    const sweepIndex = bars.length - 1;
    expect(threeGateEntry(bars, 100, 'support', sweepIndex, sweepIndex)).toBeNull();
  });
});
