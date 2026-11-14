import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const tradeMode = pgEnum('trade_mode', ['live', 'paper', 'backtest']);
export const assetClass = pgEnum('asset_class', ['stock', 'option', 'crypto']);
export const direction = pgEnum('direction', ['long', 'short']);
export const optionType = pgEnum('option_type', ['call', 'put']);
// The stop rule chosen before entry (setups.md section 5): S1 a 5m close
// back across the 5m middle band, S2 a 1m close beyond the entry candle's
// far extreme, S3 the planned time stop. Judged by the Stop OK gate.
export const stopRule = pgEnum('stop_rule', ['S1', 'S2', 'S3']);
export const exitReason = pgEnum('exit_reason', [
  'invalidation',
  'target',
  'fib_rejection',
  'planned_partial',
  'structural_trail',
  'planned_time_exit',
  'sweep_scare',
  'adverse_candle',
  'pnl_moved',
  'time_in_trade',
  'felt_heavy',
]);
export const journalKind = pgEnum('journal_kind', ['plan', 'review', 'thesis']);
// Edge rules describe the setup; discipline rules are about risk and process.
export const ruleKind = pgEnum('rule_kind', ['edge', 'discipline']);
// The way a fib extension runs, from its 50% towards its 100%.
export const fibDirection = pgEnum('fib_direction', ['bullish', 'bearish']);

const price = (name) => numeric(name, { precision: 18, scale: 6, mode: 'number' });

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// A named setup the trader trades, with the checklist of rules it requires.
export const strategies = pgTable('strategies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  ...timestamps,
});

export const strategyRules = pgTable(
  'strategy_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    strategyId: uuid('strategy_id')
      .notNull()
      .references(() => strategies.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    kind: ruleKind('kind').notNull(),
    // Order within the strategy's checklist.
    position: integer('position').notNull(),
    ...timestamps,
  },
  (t) => [index('strategy_rules_strategy_id_idx').on(t.strategyId)]
);

// A trade starts as a plan. opened_at marks the entry fill and closed_at the
// exit, so status (planned, open, closed) is derived rather than stored.
export const trades = pgTable(
  'trades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mode: tradeMode('mode').notNull(),
    symbol: text('symbol').notNull(),
    assetClass: assetClass('asset_class').notNull(),
    direction: direction('direction').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 8, mode: 'number' }).notNull(),
    multiplier: integer('multiplier').notNull().default(1),
    // For options: the contract. `symbol` stays the underlying (SPY).
    optionType: optionType('option_type'),
    strike: price('strike'),
    // A calendar date, kept as 'YYYY-MM-DD' so no time zone can shift it.
    expiration: date('expiration', { mode: 'string' }),
    plannedEntry: price('planned_entry'),
    entryPrice: price('entry_price'),
    initialStop: price('initial_stop'),
    stopRule: stopRule('stop_rule'),
    target: price('target'),
    exitPrice: price('exit_price'),
    fees: numeric('fees', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    exitReason: exitReason('exit_reason'),
    exitedPerPlan: boolean('exited_per_plan'),
    // Deleting a strategy keeps its trades; they just lose the link.
    strategyId: uuid('strategy_id').references(() => strategies.id, { onDelete: 'set null' }),
    // Circuit breakers that were tripped when the entry was recorded anyway.
    overriddenBreakers: text('overridden_breakers').array().notNull().default(sql`'{}'::text[]`),
    ...timestamps,
  },
  (t) => [
    check('trades_quantity_positive', sql`${t.quantity} > 0`),
    check('trades_multiplier_positive', sql`${t.multiplier} > 0`),
    check(
      'trades_option_fields_only_on_options',
      sql`${t.assetClass} = 'option' OR (${t.optionType} IS NULL AND ${t.strike} IS NULL AND ${t.expiration} IS NULL)`
    ),
    check(
      'trades_closed_after_opened',
      sql`${t.closedAt} IS NULL OR (${t.openedAt} IS NOT NULL AND ${t.closedAt} >= ${t.openedAt})`
    ),
  ]
);

// Journal entries outlive their trade: deleting a trade unlinks its entries
// instead of deleting your notes.
export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tradeId: uuid('trade_id').references(() => trades.id, { onDelete: 'set null' }),
    kind: journalKind('kind').notNull(),
    // An entry linked to a trade is saved with the trade's mode, and keeps it
    // if the trade is deleted; one with no trade says its own (live unless set).
    mode: tradeMode('mode').notNull().default('live'),
    symbol: text('symbol'),
    notes: text('notes').notNull(),
    emotion: text('emotion'),
    mistakes: text('mistakes').array().notNull().default(sql`'{}'::text[]`),
    emotionalControl: integer('emotional_control'),
    // The coaching pass's text for a review entry, and when it was written.
    coaching: text('coaching'),
    coachedAt: timestamp('coached_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('journal_entries_trade_id_idx').on(t.tradeId),
    check(
      'journal_entries_emotional_control_range',
      sql`${t.emotionalControl} IS NULL OR ${t.emotionalControl} BETWEEN 1 AND 10`
    ),
    check(
      'journal_entries_emotional_control_review_only',
      sql`${t.emotionalControl} IS NULL OR ${t.kind} = 'review'`
    ),
  ]
);

// The trader's own circuit breakers. One row (id 1); a null limit is off.
// `modes` are the trade modes the limits count and apply to.
export const circuitBreakerSettings = pgTable(
  'circuit_breaker_settings',
  {
    id: integer('id').primaryKey().default(1),
    maxDailyLossR: numeric('max_daily_loss_r', { precision: 6, scale: 2, mode: 'number' }),
    maxTradesPerDay: integer('max_trades_per_day'),
    cooldownAfterLosses: integer('cooldown_after_losses'),
    cooldownMinutes: integer('cooldown_minutes'),
    // Options have no stop and so no R; their own daily limit is in dollars.
    maxDailyLossOptionsDollars: numeric('max_daily_loss_options_dollars', { precision: 8, scale: 2, mode: 'number' }),
    modes: tradeMode('modes').array().notNull().default(sql`'{live}'::trade_mode[]`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check('circuit_breaker_settings_single_row', sql`${t.id} = 1`)]
);

// The option rules the trader edits (rules-v3 section 5), each with an on
// flag. One row (id 1). A null premiumMax or riskPerTrade is not set. The
// windows are [from, to] New York clock times.
export const ruleSettings = pgTable(
  'rule_settings',
  {
    id: integer('id').primaryKey().default(1),
    windowsOn: boolean('windows_on').notNull(),
    windows: jsonb('windows').notNull(),
    sizeOn: boolean('size_on').notNull(),
    sizeMin: integer('size_min').notNull(),
    sizeMax: integer('size_max').notNull(),
    premiumBandOn: boolean('premium_band_on').notNull(),
    premiumMin: numeric('premium_min', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    premiumMax: numeric('premium_max', { precision: 8, scale: 2, mode: 'number' }),
    riskPerTrade: numeric('risk_per_trade', { precision: 8, scale: 2, mode: 'number' }),
    backstopOn: boolean('backstop_on').notNull(),
    backstopPct: numeric('backstop_pct', { precision: 5, scale: 4, mode: 'number' }).notNull(),
    timeStopOn: boolean('time_stop_on').notNull(),
    timeStopMinutes: integer('time_stop_minutes').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check('rule_settings_single_row', sql`${t.id} = 1`)]
);

// The recording prompts shown next to the voice record button (setups.md
// 9.6), editable as app content rather than hard-coded. One row (id 1).
export const recordingPrompts = pgTable(
  'recording_prompts',
  {
    id: integer('id').primaryKey().default(1),
    preTradePrompt: text('pre_trade_prompt').notNull(),
    endOfDayPrompt: text('end_of_day_prompt').notNull(),
    micTips: text('mic_tips').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check('recording_prompts_single_row', sql`${t.id} = 1`)]
);

// The pre-entry checklist as answered for a trade: one row per rule. The
// rule's text is copied in, so the history survives editing or deleting it.
export const tradeRuleChecks = pgTable(
  'trade_rule_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tradeId: uuid('trade_id')
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id').references(() => strategyRules.id, { onDelete: 'set null' }),
    ruleText: text('rule_text').notNull(),
    met: boolean('met').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('trade_rule_checks_trade_rule_idx').on(t.tradeId, t.ruleId)]
);

// The market context when a trade was entered (see src/lib/context). Values
// like the option's quote can't be reconstructed later, so it's saved once,
// at entry, and kept as captured. The JSON carries its own `version`.
export const tradeContexts = pgTable('trade_contexts', {
  tradeId: uuid('trade_id')
    .primaryKey()
    .references(() => trades.id, { onDelete: 'cascade' }),
  context: jsonb('context').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Drizzle has no bytea column; node-postgres reads one as a Buffer. It sends
// only a Buffer as binary (a plain Uint8Array would go as text), hence the copy.
const bytea = customType({
  dataType: () => 'bytea',
  toDriver: (bytes) => Buffer.from(bytes),
});

export const screenshotLabel = pgEnum('screenshot_label', ['setup', 'entry', 'exit']);

// Chart screenshots attached during the review (setups.md 9.5), kept as
// uploaded. They're private trade data, so they live here behind the app
// rather than in a public bucket. At most 3 per trade (src/lib/screenshot.js).
// setups.md 9.5 suggests an object store on deploy; revisit if they crowd the
// Neon plan's storage.
export const tradeScreenshots = pgTable(
  'trade_screenshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tradeId: uuid('trade_id')
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),
    label: screenshotLabel('label'),
    contentType: text('content_type').notNull(),
    bytes: bytea('bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('trade_screenshots_trade_idx').on(t.tradeId)]
);

// [3.1] The day's fib extensions, anchored by hand around the open. The working
// lower-timeframe fib gives T1 (its 50%) and T2 (its 100%); the optional
// higher-timeframe one is the next target if price pivots against the first.
// One plan per trading day, re-saved when the anchors change.
export const dailyPlans = pgTable(
  'daily_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // A New York trading date, kept as a string so it never shifts a day west.
    tradeDate: date('trade_date', { mode: 'string' }).notNull(),
    ltfDirection: fibDirection('ltf_direction').notNull(),
    ltfFib50: price('ltf_fib_50').notNull(),
    ltfFib100: price('ltf_fib_100').notNull(),
    htfDirection: fibDirection('htf_direction'),
    htfFib50: price('htf_fib_50'),
    htfFib100: price('htf_fib_100'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('daily_plans_trade_date_key').on(t.tradeDate),
    // Half a fib is no target, so the second one's three fields go together.
    check(
      'daily_plans_htf_fib_complete',
      sql`num_nulls(${t.htfDirection}, ${t.htfFib50}, ${t.htfFib100}) IN (0, 3)`
    ),
  ]
);

// The last Performance Review written for a date range: a paid Claude call, so
// it is kept and shown until someone asks for a new one. `rangeKey` names the
// range ('7d', '30d', 'all', or 'custom:<from>:<to>'); a preset's dates move
// with the day, so the dates it covered are kept too (New York dates, null for
// all time). `review` is the five sections of reviewCoach.js; `tradeCount` the
// closed trades it read.
export const performanceReviews = pgTable('performance_reviews', {
  rangeKey: text('range_key').primaryKey(),
  review: jsonb('review').notNull(),
  tradeCount: integer('trade_count').notNull(),
  rangeFrom: date('range_from', { mode: 'string' }),
  rangeTo: date('range_to', { mode: 'string' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
});

// Wrong passwords at sign-in, one row each, so the limit holds across serverless
// instances (an in-memory count is per instance). Pruned as new ones come in.
export const signInFailures = pgTable(
  'sign_in_failures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ip: text('ip').notNull(),
    failedAt: timestamp('failed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sign_in_failures_ip_failed_at_idx').on(t.ip, t.failedAt)]
);
