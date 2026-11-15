import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewEntry } from '../setups/entryReview';
import { underlyingAtEntry } from '../underlyingAtEntry';

// The entry review has its own tests; here it only says whether the band-cross
// setup fired and where its S2 stop was.
vi.mock('../setups/entryReview', () => ({ reviewEntry: vi.fn() }));

const MINUTE = 60_000;
const start = Date.parse('2026-10-27T14:50:00Z');
// Three minute bars, the fill (14:51:20) in the second, whose VWAP is 580.12.
const bars = [0, 1, 2].map((k) => ({
  t: new Date(start + k * MINUTE).toISOString(),
  o: 580,
  h: 580.3,
  l: 579.9,
  c: 580.1,
  v: 1000,
  vw: k === 1 ? 580.12 : 580.05,
}));

// A bought call: a bet the underlying goes up.
const call = { assetClass: 'option', optionType: 'call', direction: 'long', symbol: 'SPY', openedAt: new Date('2026-10-27T14:51:20Z') };
const put = { ...call, optionType: 'put' };

const fired = (idealStop) => ({ setup: { name: 'band_cross', idealStop } });

beforeEach(() => reviewEntry.mockReset());

describe('underlyingAtEntry', () => {
  it("takes the underlying's entry from the VWAP of the minute bar holding the fill", () => {
    reviewEntry.mockReturnValue({ setup: null });

    expect(underlyingAtEntry(call, bars).entry).toBe(580.12);
  });

  it("derives the stop from the band-cross setup's S2 when it fired the trade's way before the fill", () => {
    reviewEntry.mockReturnValue(fired(579.4));

    expect(underlyingAtEntry(call, bars)).toEqual({ entry: 580.12, derivedStop: { stop: 579.4, rule: 'band_cross_s2' } });
    expect(reviewEntry).toHaveBeenCalledWith(call, bars);
  });

  it('derives nothing when the setup did not fire, and never guesses another stop', () => {
    reviewEntry.mockReturnValue({ setup: null });

    expect(underlyingAtEntry(call, bars).derivedStop).toBeNull();
  });

  it('derives nothing when the S2 level was already on the wrong side of the fill', () => {
    // A call's stop above the underlying's entry, or a put's below it, measures no risk.
    reviewEntry.mockReturnValue(fired(580.5));
    expect(underlyingAtEntry(call, bars).derivedStop).toBeNull();

    reviewEntry.mockReturnValue(fired(579.4));
    expect(underlyingAtEntry(put, bars).derivedStop).toBeNull();
  });

  it("checks a put's side the other way: its stop is above the entry", () => {
    reviewEntry.mockReturnValue(fired(580.6));

    expect(underlyingAtEntry(put, bars).derivedStop).toEqual({ stop: 580.6, rule: 'band_cross_s2' });
  });

  it('has neither without a bar holding the fill, since the side can\'t be checked', () => {
    reviewEntry.mockReturnValue(fired(579.4));

    expect(underlyingAtEntry({ ...call, openedAt: new Date('2026-10-27T15:30:00Z') }, bars)).toEqual({
      entry: null,
      derivedStop: null,
    });
  });
});
