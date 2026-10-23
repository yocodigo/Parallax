import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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
export const exitReason = pgEnum('exit_reason', ['target', 'stop', 'time', 'discretionary']);
export const journalKind = pgEnum('journal_kind', ['plan', 'review', 'thesis']);
// Edge rules describe the setup; discipline rules are about risk and process.
export const ruleKind = pgEnum('rule_kind', ['edge', 'discipline']);

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
    symbol: text('symbol'),
    notes: text('notes').notNull(),
    emotion: text('emotion'),
    mistakes: text('mistakes').array().notNull().default(sql`'{}'::text[]`),
    ...timestamps,
  },
  (t) => [index('journal_entries_trade_id_idx').on(t.tradeId)]
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
    modes: tradeMode('modes').array().notNull().default(sql`'{live}'::trade_mode[]`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check('circuit_breaker_settings_single_row', sql`${t.id} = 1`)]
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
