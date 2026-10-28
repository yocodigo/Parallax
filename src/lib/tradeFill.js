import { z } from 'zod';

// Entry and exit times come from the browser's clock, which can run a little
// ahead of the server's.
const CLOCK_SKEW_MS = 5 * 60 * 1000;

// The exit ladder (setups.md section 6), tier 1-2 planned exits before tier
// 3-4 discomfort exits.
export const EXIT_REASONS = [
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
];

export const EXIT_REASON_LABELS = {
  invalidation: 'Invalidation (stop rule hit)',
  target: 'Target hit',
  fib_rejection: 'Fib rejection',
  planned_partial: 'Planned partial',
  structural_trail: 'Structural trail',
  planned_time_exit: 'Planned time exit',
  sweep_scare: 'Sweep scare',
  adverse_candle: 'Adverse candle',
  pnl_moved: 'P/L moved',
  time_in_trade: 'Time in trade (unplanned)',
  felt_heavy: 'Felt heavy',
};

const price = z.number().positive();
const time = z.coerce.date({ error: 'Enter a valid time' });
const notInFuture = (now) => (date) => date.getTime() <= now.getTime() + CLOCK_SKEW_MS;

// Body of recording a plan's entry fill: { entryPrice, openedAt }.
export function parseTradeEntry(input, { now = new Date() } = {}) {
  return z
    .object({
      entryPrice: price,
      openedAt: time.refine(notInFuture(now), "The fill time can't be in the future"),
    })
    .safeParse(input);
}

// Body of recording an open trade's exit. `trade` is the trade being closed,
// so the exit can be checked against its entry.
export function parseTradeExit(input, trade, { now = new Date() } = {}) {
  return z
    .object({
      exitPrice: price,
      closedAt: time
        .refine(notInFuture(now), "The exit time can't be in the future")
        .refine((date) => date >= trade.openedAt, "The exit can't be before the entry"),
      exitReason: z.enum(EXIT_REASONS),
      // Required on purpose: whether you stuck to the plan is the point.
      exitedPerPlan: z.boolean({ error: 'Say whether you followed the plan' }),
      fees: z.number().nonnegative().default(0),
    })
    .safeParse(input);
}
