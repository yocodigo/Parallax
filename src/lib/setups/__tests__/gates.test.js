import { describe, expect, it } from 'vitest';
import { EMOTIONS, MISTAKES } from '../../journalEntry';
import { sizeGate, stateGate, targetGate, windowGate } from '../gates';

// New York times, the clock the app keeps. setups.md writes the lockouts on
// the user's Pacific clock: 6:30-6:45, 8:00-11:00, 11:45-12:00.
const at = (nyTime) => new Date(`2026-10-28T${nyTime}:00-04:00`);

describe('windowGate', () => {
  it('misses inside each lockout window', () => {
    expect(windowGate(at('09:35'))).toBe('missed');
    expect(windowGate(at('12:30'))).toBe('missed');
    expect(windowGate(at('14:50'))).toBe('missed');
  });

  it('is met between the windows', () => {
    expect(windowGate(at('10:15'))).toBe('met');
    expect(windowGate(at('14:30'))).toBe('met');
    expect(windowGate(at('15:30'))).toBe('met');
  });

  it('locks out from the start of a window up to its end', () => {
    expect(windowGate(at('09:30'))).toBe('missed');
    expect(windowGate(at('09:44'))).toBe('missed');
    expect(windowGate(at('09:45'))).toBe('met');
  });

  it('keeps the windows on the New York clock through the winter', () => {
    expect(windowGate(new Date('2026-01-14T09:35:00-05:00'))).toBe('missed');
    expect(windowGate(new Date('2026-01-14T10:15:00-05:00'))).toBe('met');
  });

  it("can't judge a plan that was never entered", () => {
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
