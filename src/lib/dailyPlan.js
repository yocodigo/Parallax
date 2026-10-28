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

const SECOND_FIB_FIELDS = [
  ['htfDirection', 'direction'],
  ['htfFib50', '50%'],
  ['htfFib100', '100%'],
];

// The second fib is optional, but half of one is no use: a target needs both
// levels and the direction a pivot would be against.
function checkSecondFib(plan, ctx) {
  if (SECOND_FIB_FIELDS.every(([field]) => plan[field] === undefined)) return;
  for (const [field, label] of SECOND_FIB_FIELDS) {
    if (plan[field] === undefined) {
      ctx.addIssue({ code: 'custom', path: [field], message: `The second fib needs its ${label}` });
    }
  }
}

// [3.1] The day's fib extensions, which Joel anchors by hand from the 30-60 minutes
// around the open. The working (lower-timeframe) fib gives T1 and T2; the
// higher-timeframe one is the next target if price pivots against it.
const fields = z.object({
  tradeDate: z.iso.date({ error: 'Enter the day as a date' }),
  ltfDirection: fibDirection,
  ltfFib50: price,
  ltfFib100: price,
  htfDirection: fibDirection.optional(),
  htfFib50: price.optional(),
  htfFib100: price.optional(),
  notes: z.string().optional(),
});

// These checks only run once every field above parses, so a half-filled second
// fib is reported after the working fib is fixed rather than alongside it. That
// is also what the undefined guards in extendsPast50 are for: an absent second
// fib, whose levels are optional.
const schema = fields
  .refine((plan) => extendsPast50(plan.ltfDirection, plan.ltfFib50, plan.ltfFib100), {
    path: ['ltfFib100'],
    message: ORDER_MESSAGE,
  })
  .refine((plan) => extendsPast50(plan.htfDirection, plan.htfFib50, plan.htfFib100), {
    path: ['htfFib100'],
    message: ORDER_MESSAGE,
  })
  .superRefine(checkSecondFib);

export function parseDailyPlan(input) {
  return schema.safeParse(input);
}
