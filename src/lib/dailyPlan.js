import { z } from 'zod';

const price = z.number().positive();

const fibDirection = z.enum(['bullish', 'bearish']);

// A fib extension runs from its 50% to its 100% in the fib's own direction, so
// a 100% on the near side of the 50% is a swapped or misheard number.
const extendsPast50 = (direction, fib50, fib100) =>
  direction === undefined ||
  fib50 === undefined ||
  fib100 === undefined ||
  (direction === 'bullish' ? fib100 > fib50 : fib100 < fib50);

const ORDER_MESSAGE = 'The 100% must be above the 50% for a bullish fib and below it for a bearish one';

const fibFields = (prefix) => [
  [`${prefix}Direction`, 'direction'],
  [`${prefix}Fib50`, '50%'],
  [`${prefix}Fib100`, '100%'],
];

const FIBS = [
  { name: 'working', fields: fibFields('ltf') },
  { name: 'second', fields: fibFields('htf') },
];

// Both fibs are optional (the working one is anchored after the open, so a
// plan started before it has none yet), but half of one is no use: a target
// needs both levels and the fib's direction.
function checkWholeFibs(plan, ctx) {
  for (const { name, fields } of FIBS) {
    if (fields.every(([field]) => plan[field] === undefined)) continue;
    for (const [field, label] of fields) {
      if (plan[field] === undefined) {
        ctx.addIssue({ code: 'custom', path: [field], message: `The ${name} fib needs its ${label}` });
      }
    }
  }
}

// [rules-v3 3] The overnight sessions' highs and lows, typed in from Joel's
// chart indicator and never worked out from bars (Alpaca's stock bars miss
// the Asia session). Each is optional, and a blank one is absent, never zero.
export const OVERNIGHT_SESSIONS = [
  { prefix: 'asia', label: 'Asia' },
  { prefix: 'london', label: 'London' },
  { prefix: 'premarket', label: 'Premarket' },
];

const overnightFields = {
  asiaHigh: price.optional(),
  asiaLow: price.optional(),
  londonHigh: price.optional(),
  londonLow: price.optional(),
  premarketHigh: price.optional(),
  premarketLow: price.optional(),
};

// A session's high below its low is a swapped or misheard number.
function checkOvernightOrder(plan, ctx) {
  for (const { prefix, label } of OVERNIGHT_SESSIONS) {
    const high = plan[`${prefix}High`];
    const low = plan[`${prefix}Low`];
    if (high !== undefined && low !== undefined && high < low) {
      ctx.addIssue({ code: 'custom', path: [`${prefix}High`], message: `The ${label} high must be at or above its low` });
    }
  }
}

// [3.1] The day's fib extensions, which Joel anchors by hand from the 30-60 minutes
// around the open. The working (lower-timeframe) fib gives T1 and T2; the
// higher-timeframe one is the next target if price pivots against it.
const fields = z.object({
  tradeDate: z.iso.date({ error: 'Enter the day as a date' }),
  ltfDirection: fibDirection.optional(),
  ltfFib50: price.optional(),
  ltfFib100: price.optional(),
  htfDirection: fibDirection.optional(),
  htfFib50: price.optional(),
  htfFib100: price.optional(),
  ...overnightFields,
  notes: z.string().optional(),
});

// These checks only run once every field above parses, so a half-filled second
// fib is reported after the other fields are fixed rather than alongside them.
// The undefined guards in extendsPast50 are for an absent fib, whose levels
// are optional.
const schema = fields
  .refine((plan) => extendsPast50(plan.ltfDirection, plan.ltfFib50, plan.ltfFib100), {
    path: ['ltfFib100'],
    message: ORDER_MESSAGE,
  })
  .refine((plan) => extendsPast50(plan.htfDirection, plan.htfFib50, plan.htfFib100), {
    path: ['htfFib100'],
    message: ORDER_MESSAGE,
  })
  .superRefine(checkWholeFibs)
  .superRefine(checkOvernightOrder);

export function parseDailyPlan(input) {
  return schema.safeParse(input);
}
