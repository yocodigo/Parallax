import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const tradeMode = pgEnum('trade_mode', ['live', 'paper', 'backtest']);
export const assetClass = pgEnum('asset_class', ['stock', 'option', 'crypto']);
export const direction = pgEnum('direction', ['long', 'short']);
export const exitReason = pgEnum('exit_reason', ['target', 'stop', 'time', 'discretionary']);
export const journalKind = pgEnum('journal_kind', ['plan', 'review', 'thesis']);

const price = (name) => numeric(name, { precision: 18, scale: 6, mode: 'number' });

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

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
    // Circuit breakers that were tripped when the entry was recorded anyway.
    overriddenBreakers: text('overridden_breakers').array().notNull().default(sql`'{}'::text[]`),
    ...timestamps,
  },
  (t) => [
    check('trades_quantity_positive', sql`${t.quantity} > 0`),
    check('trades_multiplier_positive', sql`${t.multiplier} > 0`),
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
