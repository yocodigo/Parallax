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

  it("says the review prices are the underlying's and chase is not a trade result", () => {
    expect(COACHING_SYSTEM_PROMPT).toMatch(/are the underlying's/);
    expect(COACHING_SYSTEM_PROMPT).toMatch(/premiums/);
    expect(COACHING_SYSTEM_PROMPT).toMatch(/not a trade result/);
  });

  it('tells Claude to use the stated direction and bet instead of assuming one', () => {
    expect(COACHING_SYSTEM_PROMPT).toContain('never assume a direction');
    expect(COACHING_SYSTEM_PROMPT).toContain('A bought put is long the contract but a bearish bet');
  });

  it("tells Claude the day's fib plan and the strategy are the trader's own plan", () => {
    expect(COACHING_SYSTEM_PROMPT).toContain("the day's fib plan");
    expect(COACHING_SYSTEM_PROMPT).toContain("don't say there was no plan unless the input says none was recorded");
  });

  it('ties playbook steps 4 and 5 to the end-of-day review this pass follows', () => {
    expect(COACHING_SYSTEM_PROMPT).toMatch(/follows their end-of-day review, which is steps 4 and 5/);
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

  it('states the direction, contract, and bet on the underlying instead of leaving them to be guessed', () => {
    expect(text).toContain('Direction: long (the contract was bought)');
    expect(text).toContain('Contract: call, strike 680, expires 2026-10-27');
    expect(text).toContain('Bet on the underlying: bullish');
  });

  it('reads a bought put as a bearish bet, and a sold one as bullish', () => {
    const withTrade = (overrides) =>
      formatCoachingInput(facts({ trades: [{ ...facts().trades[0], trade: { ...optionTrade, ...overrides } }] }));

    const put = withTrade({ optionType: 'put', strike: 675 });
    expect(put).toContain('Contract: put, strike 675, expires 2026-10-27');
    expect(put).toContain('Bet on the underlying: bearish');
    const soldPut = withTrade({ optionType: 'put', direction: 'short' });
    expect(soldPut).toContain('Direction: short (the contract was sold)');
    expect(soldPut).toContain('Bet on the underlying: bullish');
  });

  it('states a stock trade’s direction with no contract', () => {
    const stock = { ...optionTrade, assetClass: 'stock', optionType: null, strike: null, expiration: null, direction: 'short' };
    const stockText = formatCoachingInput(facts({ trades: [{ ...facts().trades[0], trade: stock }] }));

    expect(stockText).toContain('Direction: short (sold short)');
    expect(stockText).toContain('Bet on the underlying: bearish');
    expect(stockText).not.toContain('Contract:');
  });

  it('gives the fill times in New York time, and only the entry while the trade is open', () => {
    expect(text).toContain('Fills (New York time): in at 10:53 AM, out at 11:10 AM');
    const open = formatCoachingInput(
      facts({ trades: [{ ...facts().trades[0], trade: { ...optionTrade, exitPrice: null, closedAt: null } }] })
    );
    expect(open).toContain('Fills (New York time): in at 10:53 AM, still open');
  });

  it('names the strategy the trade was planned under, or says it had none', () => {
    const withFacts = (extra) => formatCoachingInput(facts({ trades: [{ ...facts().trades[0], ...extra }] }));

    expect(withFacts({ strategyName: 'Band cross' })).toContain('Strategy: Band cross');
    expect(withFacts({ strategyName: null })).toContain('Strategy: none picked');
  });

  it("gives the day's fib plan and its notes, or says none was recorded", () => {
    const withPlan = (dailyPlan) =>
      formatCoachingInput(facts({ trades: [{ ...facts().trades[0], dailyPlan }] }));
    const plan = {
      ltfDirection: 'bullish',
      ltfFib50: 101,
      ltfFib100: 103.5,
      htfDirection: 'bearish',
      htfFib50: 98,
      htfFib100: 95,
      notes: 'Wait for the 15m cross.',
    };

    const full = withPlan(plan);
    expect(full).toContain('Daily plan: lower-timeframe fib bullish, 50% 101.00 and 100% 103.50; higher-timeframe fib bearish, 50% 98.00 and 100% 95.00');
    expect(full).toContain('Daily plan notes: Wait for the 15m cross.');
    const partial = withPlan({ ...plan, htfDirection: null, htfFib50: null, htfFib100: null, notes: null });
    expect(partial).toContain('Daily plan: lower-timeframe fib bullish, 50% 101.00 and 100% 103.50.');
    expect(partial).not.toContain('higher-timeframe');
    expect(partial).not.toContain('Daily plan notes');
    expect(withPlan(null)).toContain('Daily plan: none recorded for this day');
  });

  it("gives the trader's own review of it", () => {
    expect(text).toContain('Review: feeling Impatient; mistakes Entered late; emotional control 6/10. Chased it.');
  });

  it('gives the entry review', () => {
    expect(text).toContain(
      "Setup: 3.1 15m band cross with fib extension targets, ideal entry 12.50 and ideal stop 12.05 on the underlying; the fill chased 0.7x the setup's entry-to-stop distance past it"
    );
    expect(text).toContain("5m entry bar: overlap 8% of the bar before, volume 1.6x the bar before's");
    expect(text).toContain('1m room to the outer band on the underlying: 0.46, needed 0.12 (enough)');
    expect(text).toContain('Four-touch line: 4xBO on the 5m, valid, grade A');
    expect(text).toContain('Flags: in an entry window, pressure date');
  });

  it('gives the exit review and stop adherence', () => {
    expect(text).toContain(
      'Exit: T1 100.00 and T2 102.00 on the underlying; reaction at T1 rejected; verdict early against 3.1 step 5; underlying at exit 99.30; recorded reason Felt heavy'
    );
    expect(text).toContain('Stop rule S2: miss (a discomfort exit before the rule fired)');
  });

  it('never writes R for an option without a stop', () => {
    const tradeLines = text.slice(text.indexOf('<trade'), text.indexOf('</trade>'));
    expect(tradeLines).not.toMatch(/\dR\b/);
  });

  it('words a fill that beat the ideal entry, one at it, short room, and missing volume', () => {
    const variant = (review) => formatCoachingInput(facts({ trades: [{ ...facts().trades[0], entryReview: { ...entryReview, ...review } }] }));
    expect(variant({ chaseR: -0.34 })).toContain("the fill beat it by 0.3x the setup's entry-to-stop distance");
    expect(variant({ chaseR: 0.02 })).toContain('on the underlying; the fill was at it');
    expect(variant({ room: { distance: -0.1, needed: 0.12, ok: false } })).toContain('needed 0.12 (short)');
    expect(variant({ entryCandle: { overlap: 0, volumeVsPrevious: null, risingVolume: false } })).toContain(
      'volume not comparable (the bar before had none)'
    );
  });

  it('flags mid-range, an unknown mid-range, and a Gann date', () => {
    const variant = (review) => formatCoachingInput(facts({ trades: [{ ...facts().trades[0], entryReview: { ...entryReview, ...review } }] }));
    expect(variant({ inLockout: false, pressureDate: false, midRange: true, seasonalDate: '09-23' })).toContain(
      'Flags: mid-range entry, Gann date 09-23'
    );
    expect(variant({ inLockout: false, pressureDate: false, midRange: null })).toContain('Flags: mid-range unknown');
  });

  it('names a setup missing from the names list by its key', () => {
    const review = { ...entryReview, setup: { ...entryReview.setup, name: 'new_setup' } };
    const text = formatCoachingInput(facts({ trades: [{ ...facts().trades[0], entryReview: review }] }));
    expect(text).toContain('Setup: new_setup, ideal entry 12.50');
  });

  it('says so when a trade has no entry or exit review at all', () => {
    const bare = formatCoachingInput(facts({ trades: [{ ...facts().trades[0], entryReview: null, exitReview: null }] }));
    expect(bare).toContain('Entry review: none (no bars for this trade)');
    expect(bare).toContain('Exit: no review');
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
    const stockTrade = { ...optionTrade, assetClass: 'stock', optionType: null, strike: null, expiration: null, multiplier: 1, initialStop: 98, entryPrice: 100, exitPrice: 99, quantity: 100 };
    const stock = formatCoachingInput(
      facts({ trades: [{ ...facts().trades[0], trade: stockTrade, giveback: { mfeR: 1.5, r: -0.5, givenBackR: 2, flagged: true } }] })
    );
    expect(stock).toContain('Giveback: best open +1.5R, closed -0.5R, gave back 2.0R (flagged)');
  });

  it('gives the recent history: stop adherence, what is working, and the mistake ledger', () => {
    expect(text).toContain('<history>');
    expect(text).toContain('Stop adherence: 60% of the last 5 judged trades (3 adherent, 2 misses)');
    expect(text).toContain('All recent trades: 2 in R averaging +0.5R; 3 in dollars averaging +$12.50');
    expect(text).toContain('Gate "Location OK" met: 2 in dollars averaging +$40.00');
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

  it('says when no strategies are recorded', () => {
    expect(formatCoachingInput(facts({ strategies: [] }))).toContain('<strategies>\nNo strategies recorded.\n</strategies>');
  });

  it("lists the trader's strategies with their rules by kind", () => {
    expect(text).toContain('<strategy name="0DTE band cross">\n- edge: Wait for the 5m close\n- discipline: Two contracts at most\n</strategy>');
  });
});
