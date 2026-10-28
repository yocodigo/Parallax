import { describe, expect, it } from 'vitest';
import { replayStops } from '../stopReplay';

const MINUTE = 60_000;
const OPEN = Date.parse('2026-10-26T13:30:00Z');
// 130 flat 1m bars from the 9:30 open (closes at 500, so the 5m middle band
// sits at 500), with `changes` replacing bars by index.
const day = (changes = {}) =>
  Array.from({ length: 130 }, (_, k) => ({
    t: new Date(OPEN + k * MINUTE).toISOString(),
    ...(changes[k] ?? { o: 500, h: 500.5, l: 499.5, c: 500 }),
  }));
const mirror = (bars) => bars.map(({ t, o, h, l, c }) => ({ t, o: -o, h: -l, l: -h, c: -c }));

// The fill bar: entry at its close, 500.4, so 1R is 0.6 down to its 499.8 low.
const E = 110;
const fill = { o: 500, h: 500.6, l: 499.8, c: 500.4 };
const calm = { o: 500.3, h: 500.5, l: 500.2, c: 500.3 };
// Bars after the fill hold above 500 unless changed.
const after = (changes = {}) => {
  const calmAfter = Object.fromEntries(Array.from({ length: 19 }, (_, j) => [E + 1 + j, calm]));
  return day({ [E]: fill, ...calmAfter, ...changes });
};

describe('replayStops', () => {
  it('S2 exits on a 1m close beyond the fill bar\'s far extreme', () => {
    const bars = after({ [E + 2]: { o: 500.3, h: 500.3, l: 499.6, c: 499.7 } });
    expect(replayStops({ bars, entryIndex: E, bias: 'long', rules: ['S2'] })).toEqual({
      exitIndex: E + 2,
      exitPrice: 499.7,
      reason: 'S2',
      r: expect.closeTo((499.7 - 500.4) / 0.6, 9),
      t1Later: false,
    });
  });

  it('S1 exits on a 5m close back across the 5m middle band', () => {
    // Bars 111-114 close at 499.9: above the fill low, but they end the 5m bar
    // that started at the fill under its 500 middle band.
    const dip = { o: 500, h: 500.1, l: 499.85, c: 499.9 };
    const bars = after({ [E + 1]: dip, [E + 2]: dip, [E + 3]: dip, [E + 4]: dip });
    expect(replayStops({ bars, entryIndex: E, bias: 'long', rules: ['S1'] })).toMatchObject({
      exitIndex: E + 4,
      exitPrice: 499.9,
      reason: 'S1',
    });
  });

  it('S1 still checks a 5m close whose last minute is missing from the feed', () => {
    // The same dip, but no bar traded in the 5m bar's last minute (bar 114),
    // so its close is known at the next bar, which starts at 15:25.
    const dip = { o: 500, h: 500.1, l: 499.85, c: 499.9 };
    const full = after({ [E + 1]: dip, [E + 2]: dip, [E + 3]: dip, [E + 4]: dip });
    const bars = full.filter((_, k) => k !== E + 4);
    expect(replayStops({ bars, entryIndex: E, bias: 'long', rules: ['S1'] })).toMatchObject({
      exitIndex: E + 4,
      exitPrice: 499.9,
      reason: 'S1',
    });
  });

  it('S3 exits when T1 is not reached within 15 minutes of the entry', () => {
    const bars = after();
    expect(replayStops({ bars, entryIndex: E, bias: 'long', t1: 502, rules: ['S3'] })).toMatchObject({
      exitIndex: E + 15,
      exitPrice: 500.3,
      reason: 'S3',
    });
  });

  it('takes T1 when it is reached first, even on a bar that also closes through a stop', () => {
    const bars = after({ [E + 3]: { o: 500.3, h: 502.2, l: 499.6, c: 499.7 } });
    expect(replayStops({ bars, entryIndex: E, bias: 'long', t1: 502, rules: ['S2'] })).toMatchObject({
      exitIndex: E + 3,
      exitPrice: 502,
      reason: 't1',
      r: expect.closeTo((502 - 500.4) / 0.6, 9),
    });
  });

  it('notes when a stopped trade reached T1 later the same day', () => {
    const bars = after({
      [E + 2]: { o: 500.3, h: 500.3, l: 499.6, c: 499.7 },
      [E + 10]: { o: 501, h: 502.1, l: 500.9, c: 502 },
    });
    expect(replayStops({ bars, entryIndex: E, bias: 'long', t1: 502, rules: ['S2'] })).toMatchObject({
      reason: 'S2',
      t1Later: true,
    });
  });

  it('exits at the session\'s last close when nothing triggers', () => {
    const bars = after();
    expect(replayStops({ bars, entryIndex: E, bias: 'long', rules: ['S2'] })).toMatchObject({
      exitIndex: 129,
      exitPrice: 500.3,
      reason: 'close',
    });
  });

  it('exits on whichever of several rules triggers first', () => {
    const dip = { o: 500, h: 500.1, l: 499.85, c: 499.9 };
    const bars = after({
      [E + 1]: dip,
      [E + 2]: dip,
      [E + 3]: dip,
      [E + 4]: dip,
      [E + 6]: { o: 499.9, h: 499.9, l: 499.6, c: 499.7 },
    });
    expect(replayStops({ bars, entryIndex: E, bias: 'long', rules: ['S1', 'S2'] })).toMatchObject({ reason: 'S1' });
  });

  it('has no time stop without a T1 to reach', () => {
    const result = replayStops({ bars: after(), entryIndex: E, bias: 'long', rules: ['S3'] });
    expect(result).toMatchObject({ reason: 'close' });
  });

  it('ends with the trading day, and looks for T1 only that day', () => {
    // The next day's bars open at 13:30Z and trade through T1 at once.
    const nextDay = Array.from({ length: 5 }, (_, k) => ({
      t: new Date(OPEN + (24 * 60 + k) * MINUTE).toISOString(),
      o: 502,
      h: 503,
      l: 501.5,
      c: 502.5,
    }));
    const stopped = [...after({ [E + 2]: { o: 500.3, h: 500.3, l: 499.6, c: 499.7 } }), ...nextDay];
    expect(replayStops({ bars: stopped, entryIndex: E, bias: 'long', t1: 502, rules: ['S2'] })).toMatchObject({
      reason: 'S2',
      t1Later: false,
    });
    const untouched = [...after(), ...nextDay];
    expect(replayStops({ bars: untouched, entryIndex: E, bias: 'long', t1: 502, rules: ['S2'] })).toMatchObject({
      exitIndex: 129,
      reason: 'close',
    });
  });

  it('works the same for a short', () => {
    const bars = mirror(after({ [E + 2]: { o: 500.3, h: 500.3, l: 499.6, c: 499.7 } }));
    expect(replayStops({ bars, entryIndex: E, bias: 'short', rules: ['S2'] })).toMatchObject({
      exitIndex: E + 2,
      exitPrice: -499.7,
      reason: 'S2',
      r: expect.closeTo((499.7 - 500.4) / 0.6, 9),
    });
  });
});
