// The made-up journal the public demo shows: a week of paper trades in late
// October 2026. Fill prices sit inside the real IEX bars at those times, so the
// reviews and MAE/MFE (which read Alpaca's bars) tell a consistent story. The
// coaching is written here, never by Claude, since the demo makes no paid calls.
// Times are UTC; New York was on daylight time (UTC-4).

const at = (iso) => new Date(iso);

export const DEMO_STRATEGY = {
  name: 'Band cross',
  description: '15m close across the middle band, then the first clean 5m break in that direction.',
  rules: [
    { kind: 'edge', text: '15m closed across the middle band in my direction' },
    { kind: 'edge', text: '5m entry candle breaks the prior high or low with little overlap' },
    { kind: 'edge', text: 'At least 1 ATR of room to the outer band on the 1m' },
    { kind: 'discipline', text: 'Risk is 1R or less, stop placed before entry' },
  ],
};

// Each trade: the plan as the plan form would send it, the plan's journal
// entry, then the entry fill (with any checklist rules not met) and the exit.
export const DEMO_TRADES = [
  {
    plan: {
      mode: 'paper',
      symbol: 'SPY',
      assetClass: 'stock',
      direction: 'long',
      quantity: 20,
      plannedEntry: 765,
      initialStop: 763.4,
      target: 768,
      stopRule: 'S2',
    },
    followsStrategy: true,
    planEntry: {
      notes: 'Opening drive held above the 15m middle band. Long the first 5m break over 765 with the stop under the entry candle.',
      emotion: 'calm',
      mistakes: [],
      createdAt: at('2026-10-26T14:20:00Z'),
    },
    entry: { entryPrice: 765.1, openedAt: at('2026-10-26T14:35:00Z'), unmetRules: [] },
    exit: {
      exitPrice: 767.3,
      closedAt: at('2026-10-26T15:10:00Z'),
      exitReason: 'fib_rejection',
      exitedPerPlan: true,
      fees: 0,
    },
  },
  {
    plan: {
      mode: 'paper',
      symbol: 'QQQ',
      assetClass: 'stock',
      direction: 'long',
      quantity: 10,
      plannedEntry: 717,
      initialStop: 715.2,
      target: 722,
      stopRule: 'S1',
    },
    followsStrategy: true,
    planEntry: {
      notes: 'QQQ leading SPY off the open. Long over 717 on the band cross; trail under 5m structure toward 722.',
      emotion: 'calm',
      mistakes: [],
      createdAt: at('2026-10-27T14:25:00Z'),
    },
    entry: { entryPrice: 717.2, openedAt: at('2026-10-27T14:40:00Z'), unmetRules: [] },
    exit: {
      exitPrice: 721.6,
      closedAt: at('2026-10-27T15:45:00Z'),
      exitReason: 'structural_trail',
      exitedPerPlan: true,
      fees: 0,
    },
  },
  {
    plan: {
      mode: 'paper',
      symbol: 'SPY',
      assetClass: 'option',
      direction: 'long',
      quantity: 2,
      multiplier: 100,
      plannedEntry: 1.1,
      target: 2,
      optionType: 'call',
      strike: 770,
      expiration: '2026-10-27',
    },
    followsStrategy: false,
    planEntry: {
      notes: '0DTE 770 calls alongside the QQQ long. Out near 2.00 or if SPY loses 768.',
      emotion: 'calm',
      mistakes: [],
      createdAt: at('2026-10-27T14:30:00Z'),
    },
    entry: { entryPrice: 1.1, openedAt: at('2026-10-27T14:35:00Z'), unmetRules: [] },
    exit: {
      exitPrice: 2.05,
      closedAt: at('2026-10-27T15:40:00Z'),
      exitReason: 'target',
      exitedPerPlan: true,
      fees: 2.6,
    },
  },
  {
    plan: {
      mode: 'paper',
      symbol: 'NVDA',
      assetClass: 'stock',
      direction: 'long',
      quantity: 50,
      plannedEntry: 218.1,
      initialStop: 217.3,
      target: 220,
      stopRule: 'S2',
    },
    followsStrategy: true,
    planEntry: {
      notes: 'NVDA gapped up. Long the first push over 218 before the 15m confirmed; stop under 217.30.',
      emotion: 'impatient',
      mistakes: ['entered_before_confirmation'],
      createdAt: at('2026-10-28T14:00:00Z'),
    },
    // Entered before the 15m close crossed the band.
    entry: { entryPrice: 218.2, openedAt: at('2026-10-28T14:05:00Z'), unmetRules: [0] },
    exit: {
      exitPrice: 217.25,
      closedAt: at('2026-10-28T15:35:00Z'),
      exitReason: 'invalidation',
      exitedPerPlan: true,
      fees: 0,
    },
  },
  {
    plan: {
      mode: 'paper',
      symbol: 'SPY',
      assetClass: 'option',
      direction: 'long',
      quantity: 2,
      multiplier: 100,
      plannedEntry: 1.3,
      optionType: 'put',
      strike: 770,
      expiration: '2026-10-28',
    },
    followsStrategy: false,
    planEntry: {
      notes: 'SPY looks heavy after the NVDA stop. 0DTE 770 puts.',
      emotion: 'frustrated',
      mistakes: ['revenge_trade', 'skipped_gate'],
      createdAt: at('2026-10-28T15:45:00Z'),
    },
    entry: { entryPrice: 1.3, openedAt: at('2026-10-28T15:50:00Z'), unmetRules: [] },
    exit: {
      exitPrice: 0.85,
      closedAt: at('2026-10-28T16:40:00Z'),
      exitReason: 'felt_heavy',
      exitedPerPlan: false,
      fees: 2.6,
    },
  },
  {
    plan: {
      mode: 'paper',
      symbol: 'AAPL',
      assetClass: 'stock',
      direction: 'short',
      quantity: 30,
      plannedEntry: 349.7,
      initialStop: 350.4,
      target: 348,
      stopRule: 'S2',
    },
    followsStrategy: true,
    planEntry: {
      notes: 'AAPL failed at 350.60 and the 15m closed back under the middle band. Short the 5m break of 349.70.',
      emotion: 'calm',
      mistakes: [],
      createdAt: at('2026-10-29T14:35:00Z'),
    },
    entry: { entryPrice: 349.6, openedAt: at('2026-10-29T14:40:00Z'), unmetRules: [] },
    exit: {
      exitPrice: 348.7,
      closedAt: at('2026-10-29T15:05:00Z'),
      exitReason: 'pnl_moved',
      exitedPerPlan: false,
      fees: 0,
    },
  },
  {
    plan: {
      mode: 'paper',
      symbol: 'QQQ',
      assetClass: 'option',
      direction: 'long',
      quantity: 1,
      multiplier: 100,
      plannedEntry: 2.4,
      target: 3.2,
      optionType: 'put',
      strike: 715,
      expiration: '2026-10-30',
    },
    followsStrategy: false,
    planEntry: {
      notes: 'QQQ rolled over from 718 at midday. Next-day 715 puts, out on a 5m close back over the band.',
      emotion: 'calm',
      mistakes: [],
      createdAt: at('2026-10-29T16:30:00Z'),
    },
    entry: { entryPrice: 2.4, openedAt: at('2026-10-29T16:35:00Z'), unmetRules: [] },
    exit: {
      exitPrice: 3.1,
      closedAt: at('2026-10-29T17:45:00Z'),
      exitReason: 'structural_trail',
      exitedPerPlan: true,
      fees: 1.3,
    },
  },
  {
    plan: {
      mode: 'paper',
      symbol: 'NVDA',
      assetClass: 'stock',
      direction: 'long',
      quantity: 40,
      plannedEntry: 214,
      initialStop: 212.8,
      target: 217,
      stopRule: 'S2',
    },
    followsStrategy: true,
    planEntry: {
      notes: 'If NVDA reclaims 214 with a 15m close over the middle band, long the 5m break. No entry before the cross this time.',
      emotion: 'calm',
      mistakes: [],
      createdAt: at('2026-10-30T13:20:00Z'),
    },
  },
];

// One review per trading day, linked to that day's first trade (by index), each
// with the coaching the demo shows.
export const DEMO_REVIEWS = [
  {
    tradeIndex: 0,
    notes: 'Took the SPY long as planned and sold into the fib rejection under 767.70. Patient entry.',
    emotion: 'calm',
    mistakes: [],
    emotionalControl: 8,
    createdAt: at('2026-10-26T20:30:00Z'),
    coaching:
      'One trade, and it was the setup: the 15m had crossed, the 5m entry broke cleanly, and you sold at the rejection for +1.29R.\n\n' +
      'Next time, note where T1 was before the entry, so the exit is a plan rather than a read.',
  },
  {
    tradeIndex: 1,
    notes: 'QQQ long trailed well, and the SPY calls hit their target. Both by the plan.',
    emotion: 'calm',
    mistakes: [],
    emotionalControl: 9,
    createdAt: at('2026-10-27T20:15:00Z'),
    coaching:
      'Your best day this week: the QQQ long made +2.20R on a structural trail and the SPY calls made $187.40 after fees.\n\n' +
      'Both exits followed the plan. Keep sizing the calls small while they run without a stop.',
  },
  {
    tradeIndex: 3,
    notes: 'Jumped the NVDA entry before the 15m crossed and got stopped. Then bought puts out of frustration and cut them for a loss.',
    emotion: 'frustrated',
    mistakes: ['entered_before_confirmation', 'revenge_trade'],
    emotionalControl: 4,
    createdAt: at('2026-10-28T20:40:00Z'),
    coaching:
      'The NVDA long skipped the first checklist rule, and the stop did its job at -1.06R. That part is fine.\n\n' +
      'The SPY puts 15 minutes later were the costly one: no plan, a skipped gate, and -$92.60. ' +
      'After a stop, the next entry should wait for the next 15m close.',
  },
  {
    tradeIndex: 5,
    notes: 'AAPL short worked but I covered when the profit moved, not at structure. QQQ puts trailed properly.',
    emotion: 'fearful',
    mistakes: ['exited_early'],
    emotionalControl: 6,
    createdAt: at('2026-10-29T20:20:00Z'),
    coaching:
      'The AAPL short was entered by the book and covered at +1.13R because the P/L moved, with the target still 0.70 away.\n\n' +
      'The QQQ puts show the alternative: trailed to a 5m close and $68.70 after fees. Let the trail decide on stocks too.',
  },
];

export const DEMO_THESES = [
  {
    symbol: 'NVDA',
    notes: 'Data-center demand still outruns supply into next year. Holding a core position; adding only on daily closes back above the 50-day.',
    createdAt: at('2026-10-25T18:00:00Z'),
  },
];
