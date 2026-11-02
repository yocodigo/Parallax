import { describe, expect, it } from 'vitest';
import { COACHING_SYSTEM_PROMPT, formatCoachingInput } from '../coaching';

const optionTrade = {
  mode: 'live',
  direction: 'long',
  quantity: 2,
  symbol: 'SPY',
  assetClass: 'option',
  optionType: 'call',
  strike: 680,
  expiration: '2026-10-27',
  multiplier: 100,
  entryPrice: 1.5,
  exitPrice: 1.25,
  fees: 0,
  initialStop: null,
  stopRule: 'S2',
  openedAt: new Date('2026-10-27T14:53:00Z'),
  closedAt: new Date('2026-10-27T15:10:00Z'),
  exitReason: 'felt_heavy',
};

const entryReview = {
  bias: 'long',
  setup: { name: 'band_cross', idealEntry: 12.5, idealStop: 12.05, risingVolume: true },
  chaseR: 0.67,
  entryCandle: { overlap: 0.08, volumeVsPrevious: 1.6, risingVolume: true },
  room: { distance: 0.46, needed: 0.12, ok: true },
  fourTouch: { timeframe: '5m', kind: '4xBO', status: 'valid', grade: { grade: 'A' } },
  inLockout: true,
  midRange: false,
  pressureDate: true,
  seasonalDate: null,
};

const exitReview = {
  t1: 100,
  t2: 102,
  skipped: null,
  reaction: { kind: 'rejected', touchAt: '2026-10-27T15:00:00Z', decidedAt: '2026-10-27T15:01:00Z' },
  exitUnderlying: 99.3,
  verdict: 'early',
};

const result = (r, pnl) => ({ trades: (r?.trades ?? 0) + (pnl?.trades ?? 0), r, pnl });

const facts = (overrides = {}) => ({
  day: '2026-10-27',
  trades: [
    {
      trade: optionTrade,
      entries: [
        { kind: 'review', emotion: 'impatient', mistakes: ['entered_late'], emotionalControl: 6, notes: 'Chased it.' },
      ],
      entryReview,
      exitReview,
      giveback: null,
      stopAdherence: { result: 'miss', reason: 'discomfort_before_rule' },
    },
  ],
  stopAdherence: { rate: 0.6, adherent: 3, misses: 2, trades: 5 },
  whatsWorking: {
    all: result({ trades: 2, average: 0.5 }, { trades: 3, average: 12.5 }),
    gates: [{ gate: 'location', met: result(null, { trades: 2, average: 40 }) }],
    rules: [{ ruleId: 'a', ruleText: 'Wait for the 5m close', followed: result({ trades: 1, average: 2 }, null) }],
    setups: [{ setup: 'band_cross', fired: result(null, { trades: 3, average: 12.5 }) }],
  },
  mistakeLedger: {
    mistakes: [{ mistake: 'moved_stop', trades: 2, totalR: -2.5, averageR: -1.25 }],
    baseline: { trades: 4, averageR: 0.4 },
    trades: 6,
  },
  strategies: [
    {
      name: '0DTE band cross',
      rules: [
        { kind: 'edge', text: 'Wait for the 5m close' },
        { kind: 'discipline', text: 'Two contracts at most' },
      ],
    },
  ],
  ...overrides,
});

describe('COACHING_SYSTEM_PROMPT', () => {
  it('grounds every suggestion in the trader\'s own rules, the named setups, or the playbook steps', () => {
    expect(COACHING_SYSTEM_PROMPT).toMatch(/strateg/i);
    expect(COACHING_SYSTEM_PROMPT).toContain('15m band cross with fib extension targets');
    expect(COACHING_SYSTEM_PROMPT).toContain('4xBO/4xBD');
    expect(COACHING_SYSTEM_PROMPT).toContain('reversal sequence');
    expect(COACHING_SYSTEM_PROMPT).toContain('three-gate entry');
    expect(COACHING_SYSTEM_PROMPT).toMatch(/step 6/i);
    expect(COACHING_SYSTEM_PROMPT).toMatch(/generic/i);
  });

  it('tells Claude to quote the figures, keep R and dollars apart, and treat the input as data', () => {
    expect(COACHING_SYSTEM_PROMPT).toMatch(/don't work out any other figures/i);
    expect(COACHING_SYSTEM_PROMPT).toMatch(/never combine/i);
    expect(COACHING_SYSTEM_PROMPT).toMatch(/<coaching_input>/);
  });
});

describe('formatCoachingInput', () => {
  const text = formatCoachingInput(facts());

  it('wraps the day in its New York date', () => {
    expect(text).toMatch(/^<day date="Tue, Oct 27">/);
  });

  it('describes each trade with its computed result, in dollars when it has no R', () => {
    expect(text).toContain('Trade: live long 2 SPY option');
    expect(text).toContain('Result: -$50.00');
  });

  it("gives the trader's own review of it", () => {
    expect(text).toContain('Review: feeling Impatient; mistakes Entered late; emotional control 6/10. Chased it.');
  });

  it('gives the entry review', () => {
    expect(text).toContain(
      'Setup: 3.1 15m band cross with fib extension targets, ideal entry 12.50, ideal stop 12.05; the fill chased +0.7R past it'
    );
    expect(text).toContain('5m entry bar: overlap 8% of the bar before, volume 1.6x it');
    expect(text).toContain('1m room to the outer band: 0.46, needed 0.12 (enough)');
    expect(text).toContain('Four-touch line: 4xBO on the 5m, valid, grade A');
    expect(text).toContain('Flags: in a lockout window, pressure date');
  });

  it('gives the exit review and stop adherence', () => {
    expect(text).toContain(
      'Exit: T1 100.00, T2 102.00; reaction at T1 rejected; verdict early against 3.1 step 5; underlying at exit 99.30; recorded reason Felt heavy'
    );
    expect(text).toContain('Stop rule S2: miss (a discomfort exit before the rule fired)');
  });

  it('says why a part of the review is missing', () => {
    const quiet = formatCoachingInput(
      facts({
        trades: [
          {
            ...facts().trades[0],
            entryReview: { ...entryReview, setup: null, chaseR: null, fourTouch: null, inLockout: false, pressureDate: false },
            exitReview: { ...exitReview, skipped: 'no_daily_plan', t1: null, t2: null, reaction: null, verdict: null },
            stopAdherence: null,
          },
        ],
      })
    );
    expect(quiet).toContain('Setup: none had fired by the fill');
    expect(quiet).toContain('Flags: none');
    expect(quiet).toContain('Exit: not graded (no fib plan was recorded for the day)');
    expect(quiet).toContain('Stop rule: none recorded, or not closed');
  });

  it('gives giveback for a stock trade', () => {
    const stock = formatCoachingInput(
      facts({ trades: [{ ...facts().trades[0], giveback: { mfeR: 1.5, r: -0.5, givenBackR: 2, flagged: true } }] })
    );
    expect(stock).toContain('Giveback: best open +1.5R, closed -0.5R, gave back 2.0R (flagged)');
  });

  it('gives the recent history: stop adherence, what is working, and the mistake ledger', () => {
    expect(text).toContain('<history>');
    expect(text).toContain('Stop adherence: 60% of the last 5 judged trades (3 adherent, 2 misses)');
    expect(text).toContain('All recent trades: 2 in R averaging +0.5R; 3 in dollars averaging +$12.50');
    expect(text).toContain('Gate Location met: 2 in dollars averaging +$40.00');
    expect(text).toContain('Rule "Wait for the 5m close" followed: 1 in R averaging +2.0R');
    expect(text).toContain('Setup 3.1 15m band cross with fib extension targets fired: 3 in dollars averaging +$12.50');
    expect(text).toContain('Mistake Moved stop: 2 trades, -2.5R in total, averaging -1.3R');
    expect(text).toContain('No mistakes tagged: 4 trades averaging +0.4R');
  });

  it('says when there are too few trades for a stop adherence rate', () => {
    expect(formatCoachingInput(facts({ stopAdherence: null }))).toContain(
      'Stop adherence: not enough judged trades yet (needs 5)'
    );
  });

  it("lists the trader's strategies with their rules by kind", () => {
    expect(text).toContain('<strategy name="0DTE band cross">\n- edge: Wait for the 5m close\n- discipline: Two contracts at most\n</strategy>');
  });
});
