import { describe, expect, it } from 'vitest';
import { adherenceRate, judgeStopAdherence, stopRuleTrigger } from '../stopAdherence';

const MINUTE = 60_000;
const OPEN = Date.parse('2026-10-27T13:30:00Z');

// A closed option trade on SPY with the S2 stop chosen, out at 10:00.
const trade = (overrides = {}) => ({
  assetClass: 'option',
  direction: 'long',
  optionType: 'call',
  symbol: 'SPY',
  stopRule: 'S2',
  openedAt: new Date('2026-10-27T13:50:30Z'),
  closedAt: new Date('2026-10-27T14:00:00Z'),
  exitReason: 'invalidation',
  ...overrides,
});

describe('judgeStopAdherence', () => {
  it('leaves out a trade with no stop rule, or one still open', () => {
    expect(judgeStopAdherence(trade({ stopRule: null }), [], null)).toBeNull();
    expect(judgeStopAdherence(trade({ closedAt: null }), [], null)).toBeNull();
  });

  it('counts an invalidation exit as adherent', () => {
    expect(judgeStopAdherence(trade(), [], null)).toEqual({ result: 'adherent', reason: 'invalidation' });
  });

  it('counts a moved or held-past stop as a miss, whatever the exit reason', () => {
    expect(judgeStopAdherence(trade(), ['moved_stop'], null)).toEqual({ result: 'miss', reason: 'mistake' });
    expect(judgeStopAdherence(trade({ exitReason: 'target' }), ['held_past_stop'], null)).toEqual({
      result: 'miss',
      reason: 'mistake',
    });
  });

  it('counts a planned exit as adherent', () => {
    for (const exitReason of ['target', 'fib_rejection', 'planned_partial', 'structural_trail', 'planned_time_exit']) {
      expect(judgeStopAdherence(trade({ exitReason }), [], null)).toEqual({ result: 'adherent', reason: 'plan_exit' });
    }
  });

  describe('a discomfort exit', () => {
    const felt = trade({ exitReason: 'felt_heavy' });

    it('is a miss when taken before the chosen rule would have fired', () => {
      const replay = { triggeredAt: new Date('2026-10-27T14:05:00Z') };
      expect(judgeStopAdherence(felt, [], replay)).toEqual({ result: 'miss', reason: 'discomfort_before_rule' });
    });

    it('is a miss when the rule would never have fired that day', () => {
      expect(judgeStopAdherence(felt, [], { triggeredAt: null })).toEqual({
        result: 'miss',
        reason: 'discomfort_before_rule',
      });
    });

    it('is adherent once the rule had fired', () => {
      const replay = { triggeredAt: new Date('2026-10-27T13:58:00Z') };
      expect(judgeStopAdherence(felt, [], replay)).toEqual({ result: 'adherent', reason: 'after_rule' });
    });

    it('cannot be judged without a replay', () => {
      expect(judgeStopAdherence(felt, [], null)).toEqual({ result: 'unknown', reason: 'not_replayed' });
    });
  });

  it('cannot judge a trade with no exit reason', () => {
    expect(judgeStopAdherence(trade({ exitReason: null }), [], null)).toEqual({
      result: 'unknown',
      reason: 'no_exit_reason',
    });
  });
});

describe('stopRuleTrigger', () => {
  // Twenty quiet minutes from 9:30, the fill bar at 9:50 (low 99.5), then
  // closes at 100 until the 9:55 bar closes at 99.4, below the fill bar's low.
  const quiet = (k) => ({ t: new Date(OPEN + k * MINUTE).toISOString(), o: 100, h: 100.3, l: 99.7, c: 100, v: 100 });
  const bars = Array.from({ length: 40 }, (_, k) => {
    if (k === 20) return { ...quiet(k), h: 100.5, l: 99.5 };
    if (k === 25) return { ...quiet(k), l: 99.3, c: 99.4 };
    return quiet(k);
  });

  it('gives the close of the bar where the chosen rule would have exited', () => {
    // S2 fires on the 9:55 bar, which closes at 9:56.
    expect(stopRuleTrigger(trade(), bars, null)).toEqual({ triggeredAt: new Date('2026-10-27T13:56:00Z') });
  });

  it('gives null when the rule never fires that session', () => {
    const calm = bars.map((bar, k) => (k === 25 ? quiet(k) : bar));
    expect(stopRuleTrigger(trade(), calm, null)).toEqual({ triggeredAt: null });
  });

  it('replays a bought put as a short on the underlying', () => {
    // For a short, S2 is a close above the fill bar's high (100.5).
    const rally = bars.map((bar, k) => (k === 25 ? { ...quiet(k), h: 100.7, c: 100.6 } : bar));
    expect(stopRuleTrigger(trade({ optionType: 'put' }), rally, null)).toEqual({
      triggeredAt: new Date('2026-10-27T13:56:00Z'),
    });
  });

  it('ignores T1 for S2, so a T1 reached first does not hide the stop', () => {
    // Every quiet bar's high is 100.3, so a T1 of 100.25 is reached at once.
    expect(stopRuleTrigger(trade(), bars, 100.25)).toEqual({ triggeredAt: new Date('2026-10-27T13:56:00Z') });
  });

  it('times S3 from the fill when T1 is never reached', () => {
    // The fill bar opened at 9:50; the bar opening at 10:05 closes at 10:06.
    expect(stopRuleTrigger(trade({ stopRule: 'S3' }), bars, 101)).toEqual({
      triggeredAt: new Date('2026-10-27T14:06:00Z'),
    });
  });

  it('times S1 at the close of the 5m bar, even when the 1m feed has a gap', () => {
    // Flat at 100 from 9:30, filled at 11:20. The 5m bar from 11:25 has only
    // two minutes of trades, the second closing at 99.9, below the middle
    // band; the next trade is at 11:30. The 5m bar closed at 11:30, so the
    // rule fired then, not when its last 1m bar ended at 11:27.
    const flat = (k) => ({ t: new Date(OPEN + k * MINUTE).toISOString(), o: 100, h: 100.1, l: 99.9, c: 100, v: 100 });
    const gapped = [];
    for (let k = 0; k < 130; k++) {
      if (k === 117 || k === 118 || k === 119) continue;
      gapped.push(k === 116 ? { ...flat(k), c: 99.9 } : flat(k));
    }
    const s1 = trade({ stopRule: 'S1', openedAt: new Date('2026-10-27T15:20:30Z'), closedAt: new Date('2026-10-27T15:40:00Z') });
    expect(stopRuleTrigger(s1, gapped, null)).toEqual({ triggeredAt: new Date('2026-10-27T15:30:00Z') });
  });

  it('cannot replay S3 without a T1, a trade held past the session, or a fill with no bar', () => {
    expect(stopRuleTrigger(trade({ stopRule: 'S3' }), bars, null)).toBeNull();
    expect(stopRuleTrigger(trade({ closedAt: new Date('2026-10-28T14:00:00Z') }), bars, null)).toBeNull();
    expect(stopRuleTrigger(trade({ openedAt: new Date('2026-10-27T12:00:00Z') }), bars, null)).toBeNull();
  });
});

describe('adherenceRate', () => {
  const judged = (result, day) => ({ closedAt: new Date(`2026-10-${String(day).padStart(2, '0')}T15:00:00Z`), result });

  it('stays quiet with fewer than 5 judged trades', () => {
    expect(adherenceRate([1, 2, 3, 4].map((day) => judged('adherent', day)))).toBeNull();
  });

  it('gives the share of adherent trades', () => {
    const trades = [judged('adherent', 1), judged('miss', 2), judged('adherent', 3), judged('adherent', 4), judged('miss', 5)];
    expect(adherenceRate(trades)).toEqual({ rate: 0.6, adherent: 3, misses: 2, trades: 5 });
  });

  it('leaves out trades it could not judge', () => {
    const trades = [1, 2, 3, 4, 5].map((day) => judged('adherent', day));
    expect(adherenceRate([...trades, judged('unknown', 6), judged('unknown', 7)])).toMatchObject({ trades: 5, rate: 1 });
  });

  it('uses the 20 most recent judged trades', () => {
    // Five old misses, then twenty recent adherent trades.
    const old = [1, 2, 3, 4, 5].map((day) => judged('miss', day));
    const recent = Array.from({ length: 20 }, (_, k) => judged('adherent', k + 6));
    expect(adherenceRate([...old, ...recent])).toEqual({ rate: 1, adherent: 20, misses: 0, trades: 20 });
  });
});
