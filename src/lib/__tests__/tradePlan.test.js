import { describe, expect, it } from 'vitest';
import { parseTradePlan } from '../tradePlan';

const longPlan = {
  mode: 'paper',
  symbol: 'spy',
  assetClass: 'stock',
  direction: 'long',
  quantity: 10,
  plannedEntry: 100,
  initialStop: 98,
  target: 106,
};

const shortPlan = { ...longPlan, direction: 'short', initialStop: 102, target: 94 };

// Two SPY 500 calls expiring Jan 16, priced as premiums.
const optionPlan = {
  ...longPlan,
  symbol: 'SPY',
  assetClass: 'option',
  optionType: 'call',
  strike: 500,
  expiration: '2026-01-16',
  quantity: 2,
  plannedEntry: 1.25,
  initialStop: 0.8,
  target: 2.5,
};

// Field paths of every validation error, e.g. ['initialStop'].
const errorPaths = (result) => result.error.issues.map((issue) => issue.path.join('.'));

describe('parseTradePlan', () => {
  it('accepts a valid long plan and uppercases the symbol', () => {
    const result = parseTradePlan(longPlan);

    expect(result.success).toBe(true);
    expect(result.data.symbol).toBe('SPY');
  });

  it('accepts the strategy a plan follows, as a uuid', () => {
    const strategyId = '6f1c2a4e-0000-4000-8000-000000000001';

    expect(parseTradePlan({ ...longPlan, strategyId }).data.strategyId).toBe(strategyId);
    expect(parseTradePlan({ ...longPlan, strategyId: 'nope' }).success).toBe(false);
  });

  it('accepts a valid short plan', () => {
    expect(parseTradePlan(shortPlan).success).toBe(true);
  });

  it('accepts an option with its contract: type, strike, and expiration', () => {
    const result = parseTradePlan(optionPlan);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ symbol: 'SPY', optionType: 'call', strike: 500, expiration: '2026-01-16' });
  });

  it('requires the whole contract for an option', () => {
    const result = parseTradePlan({ ...optionPlan, optionType: undefined, strike: undefined, expiration: undefined });

    expect(errorPaths(result)).toEqual(expect.arrayContaining(['optionType', 'strike', 'expiration']));
  });

  it('rejects an expiration that is not a calendar date', () => {
    expect(errorPaths(parseTradePlan({ ...optionPlan, expiration: '2026-02-30' }))).toContain('expiration');
    expect(errorPaths(parseTradePlan({ ...optionPlan, expiration: 'next friday' }))).toContain('expiration');
  });

  it('rejects contract fields on a stock', () => {
    expect(errorPaths(parseTradePlan({ ...longPlan, strike: 500 }))).toContain('strike');
  });

  it('defaults the multiplier to 100 for options and 1 otherwise', () => {
    expect(parseTradePlan(optionPlan).data.multiplier).toBe(100);
    expect(parseTradePlan(longPlan).data.multiplier).toBe(1);
  });

  it('requires a stop, since R is measured from it', () => {
    const result = parseTradePlan({ ...longPlan, initialStop: undefined });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('initialStop');
  });

  it('rejects a stop on the wrong side of the entry', () => {
    expect(errorPaths(parseTradePlan({ ...longPlan, initialStop: 101 }))).toContain('initialStop');
    expect(errorPaths(parseTradePlan({ ...shortPlan, initialStop: 99 }))).toContain('initialStop');
  });

  it('rejects a target on the wrong side of the entry', () => {
    expect(errorPaths(parseTradePlan({ ...longPlan, target: 95 }))).toContain('target');
    expect(errorPaths(parseTradePlan({ ...shortPlan, target: 105 }))).toContain('target');
  });

  it('allows a plan without a target', () => {
    expect(parseTradePlan({ ...longPlan, target: undefined }).success).toBe(true);
  });

  it('rejects a quantity that is not positive', () => {
    expect(errorPaths(parseTradePlan({ ...longPlan, quantity: 0 }))).toContain('quantity');
  });
});