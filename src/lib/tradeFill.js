import { z } from 'zod';

// Entry and exit times come from the browser's clock, which can run a little
// ahead of the server's.
const CLOCK_SKEW_MS = 5 * 60 * 1000;

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
      exitReason: z.enum(['target', 'stop', 'time', 'discretionary']),
      // Required on purpose: whether you stuck to the plan is the point.
      exitedPerPlan: z.boolean({ error: 'Say whether you followed the plan' }),
      fees: z.number().nonnegative().default(0),
    })
    .safeParse(input);
}
