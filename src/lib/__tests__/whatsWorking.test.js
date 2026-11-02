import { describe, expect, it } from 'vitest';
import { whatsWorking } from '../whatsWorking';

// A closed long stock with 1R = $100 (100 shares, $1 to the stop), closed for `r`.
const stock = (r, extra = {}) => ({
  assetClass: 'stock',
  direction: 'long',
  quantity: 100,
  multiplier: 1,
  entryPrice: 50,
  initialStop: 49,
  exitPrice: 50 + r,
  fees: 0,
  openedAt: new Date('2026-10-20T14:00:00Z'),
  closedAt: new Date('2026-10-20T15:00:00Z'),
  gates: null,
  ruleChecks: [],
  setups: [],
  ...extra,
});

// A closed call with no stop, so no R: one contract, closed for `pnl` dollars
// (multiples of $25, so the premiums are exact in binary).
const option = (pnl, extra = {}) => ({
  ...stock(0),
  assetClass: 'option',
  optionType: 'call',
  multiplier: 100,
  quantity: 1,
  initialStop: null,
  entryPrice: 2,
  exitPrice: 2 + pnl / 100,
  ...extra,
});

const gates = (overrides = {}) => ({
  window: 'met',
  direction: 'met',
  entry: 'met',
  location: 'met',
  target: 'met',
  state: 'met',
  stop: 'met',
  ...overrides,
});

describe('whatsWorking', () => {
  it('gives a baseline over every trade, R and dollars kept apart', () => {
    const result = whatsWorking([stock(2), stock(-1), option(50), option(-25)]);
    expect(result.all).toEqual({
      trades: 4,
      r: { trades: 2, average: 0.5 },
      pnl: { trades: 2, average: 12.5 },
    });
  });

  it('leaves out a trade with neither R nor P/L', () => {
    const open = { ...stock(1), closedAt: null, exitPrice: null };
    expect(whatsWorking([open, stock(1)]).all.trades).toBe(1);
  });

  it('averages the trades where each gate was met, in the gate table order', () => {
    const result = whatsWorking([
      stock(2, { gates: gates() }),
      stock(-1, { gates: gates({ location: 'missed' }) }),
      option(25, { gates: { ...gates({ location: 'unknown' }), size: 'met' } }),
    ]);
    const location = result.gates.find((g) => g.gate === 'location');
    expect(location.met).toEqual({ trades: 1, r: { trades: 1, average: 2 }, pnl: null });
    const window = result.gates.find((g) => g.gate === 'window');
    expect(window.met).toEqual({ trades: 3, r: { trades: 2, average: 0.5 }, pnl: { trades: 1, average: 25 } });
    expect(result.gates.map((g) => g.gate)).toEqual([
      'window',
      'size',
      'direction',
      'entry',
      'location',
      'stop',
      'target',
      'state',
    ]);
  });

  it('leaves out a gate no trade met', () => {
    const result = whatsWorking([stock(1, { gates: gates({ state: 'unknown' }) })]);
    expect(result.gates.find((g) => g.gate === 'state')).toBeUndefined();
  });

  it('averages the trades where each checklist rule was followed, most followed first', () => {
    const result = whatsWorking([
      stock(2, { ruleChecks: [{ ruleId: 'a', ruleText: 'Trend up', met: true }, { ruleId: 'b', ruleText: 'Calm', met: true }] }),
      stock(-1, { ruleChecks: [{ ruleId: 'a', ruleText: 'Trend up', met: false }, { ruleId: 'b', ruleText: 'Calm', met: true }] }),
    ]);
    expect(result.rules).toEqual([
      { ruleId: 'b', ruleText: 'Calm', followed: { trades: 2, r: { trades: 2, average: 0.5 }, pnl: null } },
      { ruleId: 'a', ruleText: 'Trend up', followed: { trades: 1, r: { trades: 1, average: 2 }, pnl: null } },
    ]);
  });

  it('keeps a deleted rule by its text and names a rule by its latest wording', () => {
    const closed = (r, day, check) =>
      stock(r, { closedAt: new Date(`2026-10-${day}T15:00:00Z`), ruleChecks: [check] });
    const result = whatsWorking([
      closed(1, 21, { ruleId: 'a', ruleText: 'Trend up on 15m', met: true }),
      closed(1, 20, { ruleId: 'a', ruleText: 'Trend up', met: true }),
      closed(1, 22, { ruleId: null, ruleText: 'Old rule', met: true }),
    ]);
    expect(result.rules.map((rule) => rule.ruleText)).toEqual(['Trend up on 15m', 'Old rule']);
  });

  it('averages the trades each setup fired on', () => {
    const result = whatsWorking([
      option(50, { setups: ['band_cross'] }),
      option(-25, { setups: ['band_cross', 'four_touch'] }),
      stock(1),
    ]);
    expect(result.setups).toEqual([
      { setup: 'band_cross', fired: { trades: 2, r: null, pnl: { trades: 2, average: 12.5 } } },
      { setup: 'four_touch', fired: { trades: 1, r: null, pnl: { trades: 1, average: -25 } } },
    ]);
  });
});
