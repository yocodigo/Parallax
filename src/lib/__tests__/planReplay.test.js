import { describe, expect, it } from 'vitest';
import { plansNotTakenSummary, replayPlan } from '../planReplay';

// Tuesday 2026-10-27, on Eastern Daylight Time.
const at = (hhmm) => new Date(`2026-10-27T${hhmm}:00-04:00`);
const contract = (hhmm, o, h, l, c) => ({ t: at(hhmm).toISOString(), o, h, l, c, v: 10 });
const under = (hhmm, h, l, c) => ({ t: at(hhmm).toISOString(), o: c, h, l, c, v: 100 });

const RULES = { backstopOn: true, backstopPct: 0.25, timeStopOn: true, timeStopMinutes: 15 };
const call = (overrides) => ({ optionType: 'call', plannedEntry: 2, underlyingStop: null, writtenAt: at('10:00'), ...overrides });

// Written at 10:00 for a call at 2.00: the 09:59 bar is before it, 10:01 never gets down to it, and
// 10:03 trades at it.
const OPENING = [
  contract('09:59', 1.8, 2, 1.7, 1.9),
  contract('10:01', 2.4, 2.5, 2.3, 2.4),
  contract('10:03', 2.2, 2.3, 1.95, 2.1),
  contract('10:04', 2.1, 2.2, 2, 2.15),
];
// The underlying closes at 580.00 in the entry minute.
const UNDERLYING = [under('10:03', 580.2, 579.8, 580)];

const run = ({ plan, contractBars = OPENING, underlyingBars = UNDERLYING, rules = RULES, fib50 = null } = {}) =>
  replayPlan({ plan: call(plan), contractBars, underlyingBars, rules, fib50 });

describe('replayPlan: the entry', () => {
  it('fills at the planned premium on the first bar after it was written that traded there', () => {
    expect(run()).toMatchObject({ outcome: 'replayed', entryAt: at('10:03'), entryPrice: 2 });
    expect(run({ plan: { plannedEntry: 2.45 } })).toMatchObject({ entryAt: at('10:01'), entryPrice: 2.45 });
  });

  it('is never triggered when no bar after it was written reaches the planned premium', () => {
    expect(run({ plan: { plannedEntry: 1.5 } })).toEqual({ outcome: 'never_triggered' });
    // The 09:59 bar traded at 1.75, but before the plan existed.
    expect(run({ plan: { plannedEntry: 1.75 } })).toEqual({ outcome: 'never_triggered' });
  });

  it('with no planned entry, takes the open of the first bar after it was written', () => {
    expect(run({ plan: { plannedEntry: null } })).toMatchObject({ entryAt: at('10:01'), entryPrice: 2.4 });
  });

  it('is never triggered when the contract has no bars after it was written', () => {
    expect(run({ contractBars: [contract('09:59', 1.8, 2, 1.7, 1.9)] })).toEqual({ outcome: 'never_triggered' });
  });
});

describe('replayPlan: the exit', () => {
  it('sells at the backstop level when a bar trades down to it', () => {
    const bars = [...OPENING, contract('10:06', 1.9, 1.95, 1.45, 1.6)];

    expect(run({ contractBars: bars })).toMatchObject({ exitAt: at('10:06'), exitPrice: 1.5, exitReason: 'backstop' });
  });

  it('sells at the close of the minute the time stop falls on, from the last bar at or before it', () => {
    const bars = [...OPENING, contract('10:10', 2.1, 2.4, 2.1, 2.3), contract('10:16', 2.3, 2.7, 2.3, 2.6), contract('10:30', 3, 3, 3, 3)];

    expect(run({ contractBars: bars })).toMatchObject({ exitAt: at('10:18'), exitPrice: 2.6, exitReason: 'time_stop' });
  });

  it("sells at the contract's close in the minute the underlying reaches T1, when T1 is ahead of it", () => {
    const bars = [...OPENING, contract('10:06', 2.3, 2.6, 2.3, 2.5)];
    const underlying = [...UNDERLYING, under('10:06', 580.6, 580.1, 580.5)];

    expect(run({ contractBars: bars, underlyingBars: underlying, fib50: 580.5 })).toMatchObject({
      exitAt: at('10:06'),
      exitPrice: 2.5,
      exitReason: 't1',
    });
    // A fib behind the underlying at the fill is not a target.
    expect(run({ contractBars: bars, underlyingBars: underlying, fib50: 579 }).exitReason).toBe('session_close');
  });

  it('reads T1 below the underlying for a put', () => {
    const bars = [...OPENING, contract('10:06', 2.3, 2.6, 2.3, 2.5)];
    const underlying = [...UNDERLYING, under('10:06', 579.9, 579.4, 579.5)];

    const replay = run({ plan: { optionType: 'put' }, contractBars: bars, underlyingBars: underlying, fib50: 579.5 });
    expect(replay).toMatchObject({ exitAt: at('10:06'), exitReason: 't1' });
  });

  it("sells when the underlying closes beyond the plan's stop, at the contract's close that minute", () => {
    const bars = [...OPENING, contract('10:07', 1.9, 2, 1.8, 1.85)];
    const underlying = [...UNDERLYING, under('10:07', 579.8, 579.3, 579.4)];

    expect(run({ plan: { underlyingStop: 579.5 }, contractBars: bars, underlyingBars: underlying })).toMatchObject({
      exitAt: at('10:07'),
      exitPrice: 1.85,
      exitReason: 'invalidation',
    });
    // A put is invalidated by a close above its stop; a close on it isn't beyond it.
    const above = [...UNDERLYING, under('10:07', 580.8, 580.3, 580.7)];
    expect(run({ plan: { optionType: 'put', underlyingStop: 580.7 }, contractBars: bars, underlyingBars: above }).exitReason).toBe(
      'session_close'
    );
  });

  it('takes the first exit in time, and in a tie the order invalidation, backstop, T1, time stop', () => {
    const bars = [...OPENING, contract('10:06', 1.9, 1.95, 1.45, 1.6)];
    const underlying = [...UNDERLYING, under('10:06', 579.8, 579.3, 579.4)];

    const tie = run({ plan: { underlyingStop: 579.5 }, contractBars: bars, underlyingBars: underlying });
    expect(tie).toMatchObject({ exitReason: 'invalidation', exitPrice: 1.6 });
    // The backstop at 10:06 comes before the time stop at 10:18.
    expect(run({ contractBars: [...bars, contract('10:18', 3, 3, 3, 3)] }).exitReason).toBe('backstop');
  });

  it('leaves out the backstop and the time stop when their rules are off, and falls to the close of the session', () => {
    const bars = [...OPENING, contract('10:06', 1.9, 1.95, 1.45, 1.6), contract('15:59', 2.6, 2.8, 2.6, 2.7), contract('16:05', 9, 9, 9, 9)];

    const replay = run({ contractBars: bars, rules: { ...RULES, backstopOn: false, timeStopOn: false } });
    expect(replay).toMatchObject({ exitAt: at('15:59'), exitPrice: 2.7, exitReason: 'session_close' });
  });

  it('says how many of the minutes held had a bar of their own', () => {
    const bars = [...OPENING, contract('10:06', 1.9, 1.95, 1.45, 1.6)];

    // Held 10:03 to 10:06: bars at 10:04 and 10:06 of the three minutes.
    expect(run({ contractBars: bars }).barCoverage).toBeCloseTo(2 / 3);
  });
});

describe('plansNotTakenSummary', () => {
  const row = (entryPrice, exitPrice, exitReason, extra) => ({
    outcome: 'replayed',
    entryAt: at('10:03'),
    exitAt: at('10:20'),
    entryPrice,
    exitPrice,
    exitReason,
    quantity: 2,
    multiplier: 100,
    barCoverage: 1,
    ...extra,
  });
  const rows = [row(2, 2.5, 't1'), row(2, 1.5, 'backstop', { barCoverage: 0.5 }), { outcome: 'never_triggered' }];

  it('sums the replays at their planned quantity less the assumed fees, and counts the never triggered apart', () => {
    const summary = plansNotTakenSummary(rows, { fees: 1 });

    expect(summary).toMatchObject({ plans: 3, neverTriggered: 1, replayed: 2 });
    expect(summary.summary).toMatchObject({ trades: 2, wins: 1, losses: 1, grossPnl: 0, netPnl: -2 });
    expect(summary.exits).toEqual({ t1: 1, backstop: 1 });
    expect(summary.fullCoverage).toBe(1);
  });

  it('has no figures without replays', () => {
    const summary = plansNotTakenSummary([{ outcome: 'never_triggered' }], { fees: 1 });

    expect(summary).toMatchObject({ plans: 1, neverTriggered: 1, replayed: 0 });
    expect(summary.summary).toMatchObject({ trades: 0, winRate: null });
  });
});
