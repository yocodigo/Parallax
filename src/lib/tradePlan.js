import { z } from 'zod';

const price = z.number().positive();

// A stop on the wrong side of the entry is almost always a typo or a misheard
// number, and it would make the trade's R meaningless.
const stopOnLosingSide = (plan) =>
  plan.direction === 'long'
    ? plan.initialStop < plan.plannedEntry
    : plan.initialStop > plan.plannedEntry;

const targetOnWinningSide = (plan) =>
  plan.target === undefined ||
  (plan.direction === 'long' ? plan.target > plan.plannedEntry : plan.target < plan.plannedEntry);

const schema = z
  .object({
    mode: z.enum(['live', 'paper', 'backtest']),
    symbol: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9./-]{1,21}$/, 'Invalid symbol'),
    assetClass: z.enum(['stock', 'option', 'crypto']),
    direction: z.enum(['long', 'short']),
    quantity: z.number().positive(),
    multiplier: z.number().int().positive().optional(),
    plannedEntry: price,
    initialStop: price,
    target: price.optional(),
  })
  .refine(stopOnLosingSide, {
    path: ['initialStop'],
    message: 'Stop must be below the entry for a long and above it for a short',
  })
  .refine(targetOnWinningSide, {
    path: ['target'],
    message: 'Target must be above the entry for a long and below it for a short',
  })
  // Options control 100 shares per contract unless told otherwise.
  .transform((plan) => ({
    ...plan,
    multiplier: plan.multiplier ?? (plan.assetClass === 'option' ? 100 : 1),
  }));

export function parseTradePlan(input) {
  return schema.safeParse(input);
}