import { describe, expect, it } from 'vitest';
import { EMOTIONS, MISTAKES } from '../../journalEntry';
import {
  directionGate,
  entryGate,
  gradeGates,
  inWindow,
  locationGate,
  sizeGate,
  stateGate,
  stopGate,
  targetGate,
  windowGate,
} from '../gates';

// New York times, the clock the app keeps. setups.md writes the lockouts on
// the user's Pacific clock: 6:30-6:45, 8:00-11:00, 11:45-12:00.
const at = (nyTime) => new Date(`2026-10-28T${nyTime}:00-04:00`);

describe('inWindow', () => {
  it('is true inside each entry window', () => {
    expect(inWindow(at('09:35'))).toBe(true);
    expect(inWindow(at('12:30'))).toBe(true);
    expect(inWindow(at('14:50'))).toBe(true);
  });

  it('is false between the windows', () => {
    expect(inWindow(at('10:15'))).toBe(false);
    expect(inWindow(at('14:30'))).toBe(false);
    expect(inWindow(at('15:30'))).toBe(false);
  });

  it('takes a window from its start up to its end', () => {
    expect(inWindow(at('09:30'))).toBe(true);
    expect(inWindow(at('09:44'))).toBe(true);
    expect(inWindow(at('09:45'))).toBe(false);
  });

  it('keeps the windows on the New York clock through the winter', () => {
    expect(inWindow(new Date('2026-01-14T09:35:00-05:00'))).toBe(true);
    expect(inWindow(new Date('2026-01-14T10:15:00-05:00'))).toBe(false);
  });

  it('uses the windows it is given', () => {
    expect(inWindow(at('10:15'), [['10:00', '10:30']])).toBe(true);
    expect(inWindow(at('09:35'), [['10:00', '10:30']])).toBe(false);
  });

  it('is false for a plan that was never entered', () => {
    expect(inWindow(null)).toBe(false);
  });
});

// rules-v3 section 5: a window raises the bar (a detected, valid, grade A
// setup) instead of closing the door, and detected setups come later. Until
// then the windows are recorded and charted but never scored.
describe('windowGate', () => {
  it('judges nothing, inside a window or out of one', () => {
    expect(windowGate(at('09:35'))).toBe('unknown');
    expect(windowGate(at('10:15'))).toBe('unknown');
    expect(windowGate(null)).toBe('unknown');
  });
});

describe('sizeGate', () => {
  it('allows one or two contracts', () => {
    expect(sizeGate(1)).toBe('met');
    expect(sizeGate(2)).toBe('met');
  });

  it('misses outside one or two contracts', () => {
    expect(sizeGate(3)).toBe('missed');
    expect(sizeGate(0)).toBe('missed');
  });

  it("can't judge a plan with no size recorded", () => {
    expect(sizeGate(null)).toBe('unknown');
  });
});

describe('targetGate', () => {
  it('is met when the day has a plan, which always carries fib levels', () => {
    expect(targetGate({ tradeDate: '2026-10-28' })).toBe('met');
  });

  it('misses when no plan was recorded for the day', () => {
    expect(targetGate(null)).toBe('missed');
  });
});

describe('stateGate', () => {
  it('is met when the entry was logged calm with no mistakes', () => {
    expect(stateGate({ emotion: 'calm', mistakes: [] })).toBe('met');
  });

  it('misses on any other emotion', () => {
    expect(stateGate({ emotion: 'fomo', mistakes: [] })).toBe('missed');
    expect(stateGate({ emotion: 'impatient', mistakes: [] })).toBe('missed');
  });

  it('misses a calm entry tagged as a revenge trade', () => {
    expect(stateGate({ emotion: 'calm', mistakes: ['revenge_trade'] })).toBe('missed');
  });

  it("can't judge a state that was never recorded", () => {
    expect(stateGate(null)).toBe('unknown');
    expect(stateGate({ emotion: null, mistakes: [] })).toBe('unknown');
  });

  // The gate compares against these stored values, so a rename in the journal
  // lists has to reach gates.js instead of grading every entry missed.
  it('reads values the journal still records', () => {
    expect(EMOTIONS).toContain('calm');
    expect(MISTAKES).toContain('revenge_trade');
  });
});

// Twenty closes at 10, so the middle band starts at exactly 10, then `rest`.
const closes = (values) => values.map((c) => ({ c }));
const flatThen = (...rest) => closes([...Array(20).fill(10), ...rest]);

describe('directionGate', () => {
  it('is met when the 15m bias matches the trade direction', () => {
    expect(directionGate(flatThen(12), 20, 'long')).toBe('met');
    expect(directionGate(flatThen(8), 20, 'short')).toBe('met');
  });

  it('misses when the bias is the other side', () => {
    expect(directionGate(flatThen(12), 20, 'short')).toBe('missed');
    expect(directionGate(flatThen(8), 20, 'long')).toBe('missed');
  });

  it("can't judge without 20 bars ending at i for the bands", () => {
    expect(directionGate(flatThen(), 18, 'long')).toBe('unknown');
  });

  it("can't judge a trade with no recorded direction", () => {
    expect(directionGate(flatThen(12), 20, null)).toBe('unknown');
  });
});

describe('entryGate', () => {
  // Bars use Alpaca's keys: h and l are all overlap() reads.
  const bar = (h, l) => ({ h, l });

  it('is met with little or no overlap against the bar before', () => {
    expect(entryGate(bar(20, 15), bar(10, 5))).toBe('met');
  });

  it('misses with heavy overlap against the bar before', () => {
    expect(entryGate(bar(10, 5), bar(10, 5))).toBe('missed');
  });

  it("can't judge an entry candle with no range", () => {
    expect(entryGate(bar(5, 5), bar(10, 5))).toBe('unknown');
  });

  it("can't judge without both bars", () => {
    expect(entryGate(null, bar(10, 5))).toBe('unknown');
    expect(entryGate(bar(10, 5), null)).toBe('unknown');
  });
});

describe('locationGate', () => {
  const range = { low: 0, high: 100 };

  it('is met outside the middle of the dealing range', () => {
    expect(locationGate(10, range)).toBe('met');
    expect(locationGate(90, range)).toBe('met');
  });

  it('misses in the middle of the dealing range', () => {
    expect(locationGate(55, range)).toBe('missed');
  });

  it("can't judge without a price or a range", () => {
    expect(locationGate(null, range)).toBe('unknown');
    expect(locationGate(55, null)).toBe('unknown');
  });
});

describe('stopGate', () => {
  it('is met when a stop rule was chosen', () => {
    expect(stopGate('S1')).toBe('met');
    expect(stopGate('S2')).toBe('met');
    expect(stopGate('S3')).toBe('met');
  });

  // A blank stop rule reads as a gap in the journal, not a lapse: most plans
  // so far predate this field, and the plan form doesn't require it yet.
  it("can't judge a plan that never recorded one", () => {
    expect(stopGate(null)).toBe('unknown');
    expect(stopGate(undefined)).toBe('unknown');
  });
});

describe('gradeGates', () => {
  // A trade that meets every gate, as an option (so size is judged too).
  const metTrade = {
    assetClass: 'option',
    openedAt: at('10:15'),
    quantity: 1,
    direction: 'long',
    entryPrice: 10,
    stopRule: 'S1',
    dailyPlan: { tradeDate: '2026-10-28' },
    planEntry: { emotion: 'calm', mistakes: [] },
    bars15: flatThen(12),
    directionBarIndex: 20,
    entryBar: { h: 20, l: 15 },
    entryPrevBar: { h: 10, l: 5 },
    dealingRange: { low: 0, high: 100 },
  };

  it('grades every gate, including size and stop, for an option trade', () => {
    expect(gradeGates(metTrade)).toEqual({
      window: 'unknown',
      direction: 'met',
      entry: 'met',
      location: 'met',
      target: 'met',
      state: 'met',
      size: 'met',
      stop: 'met',
    });
  });

  it('leaves out size for a stock or crypto trade', () => {
    const result = gradeGates({ ...metTrade, assetClass: 'stock', quantity: 500 });
    expect(result).not.toHaveProperty('size');
  });

  it('misses one gate without affecting the others', () => {
    const result = gradeGates({ ...metTrade, quantity: 5 });
    expect(result.size).toBe('missed');
    expect(result.state).toBe('met');
    expect(result.window).toBe('unknown');
    expect(result.stop).toBe('met');
  });

  it("can't judge the stop gate without a recorded stop rule", () => {
    expect(gradeGates({ ...metTrade, stopRule: null }).stop).toBe('unknown');
  });
});
