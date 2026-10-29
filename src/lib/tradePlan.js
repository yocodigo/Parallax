import { z } from 'zod';
import { symbolSchema } from './symbol';

const price = z.number().positive();

// A stop on the wrong side of the entry is almost always a typo or a misheard
// number, and it would make the trade's R meaningless.
const stopOnLosingSide = (plan) =>
  plan.initialStop === undefined ||
  (plan.direction === 'long' ? plan.initialStop < plan.plannedEntry : plan.initialStop > plan.plannedEntry);

// Stocks and crypto need a stop, since R is measured from it. Options are
// exited by hand, so theirs is optional; without one their R stays blank.
const stopUnlessOption = (plan) => plan.assetClass === 'option' || plan.initialStop !== undefined;

const targetOnWinningSide = (plan) =>
  plan.target === undefined ||
  (plan.direction === 'long' ? plan.target > plan.plannedEntry : plan.target < plan.plannedEntry);

// The stop rules a plan can choose from (setups.md section 5), with the
// label the picker shows for each.
export const STOP_RULES = ['S1', 'S2', 'S3'];
export const STOP_RULE_LABELS = {
  S1: 'S1 · 5m band close',
  S2: 'S2 · 1m structure',
  S3: 'S3 · planned time stop',
};

const CONTRACT_FIELDS = [
  ['optionType', 'call or put'],
  ['strike', 'strike'],
  ['expiration', 'expiration'],
];

// An option needs its whole contract; a stock or crypto has none of it.
function checkContract(plan, ctx) {
  for (const [field, label] of CONTRACT_FIELDS) {
    const present = plan[field] !== undefined;
    if (plan.assetClass === 'option' && !present) {
      ctx.addIssue({ code: 'custom', path: [field], message: `An option needs its ${label}` });
    } else if (plan.assetClass !== 'option' && present) {
      ctx.addIssue({ code: 'custom', path: [field], message: 'Only options have a contract' });
    }
  }
}

const fields = z.object({
  mode: z.enum(['live', 'paper', 'backtest']),
  symbol: symbolSchema,
  assetClass: z.enum(['stock', 'option', 'crypto']),
  direction: z.enum(['long', 'short']),
  quantity: z.number().positive(),
  multiplier: z.number().int().positive().optional(),
  plannedEntry: price,
  initialStop: price.optional(),
  target: price.optional(),
  // The strategy the plan follows; its rules become the entry checklist.
  strategyId: z.uuid().optional(),
  // The stop rule chosen before entry (setups.md section 5: S1 5m band, S2
  // 1m structure, S3 planned time stop), judged by the Stop OK gate.
  stopRule: z.enum(STOP_RULES).optional(),
  // For options: the contract. The symbol is the underlying.
  optionType: z.enum(['call', 'put']).optional(),
  strike: price.optional(),
  expiration: z.iso.date({ error: 'Enter the expiration as a date' }).optional(),
});

const schema = fields
  // Runs even while other fields are invalid, so a missing stop is reported
  // with everything else that's missing rather than only after it's fixed.
  .refine(stopUnlessOption, {
    path: ['initialStop'],
    message: 'Enter a stop',
    when: ({ value }) => fields.pick({ assetClass: true, initialStop: true }).safeParse(value).success,
  })
  .refine(stopOnLosingSide, {
    path: ['initialStop'],
    message: 'Stop must be below the entry for a long and above it for a short',
  })
  .refine(targetOnWinningSide, {
    path: ['target'],
    message: 'Target must be above the entry for a long and below it for a short',
  })
  .superRefine(checkContract)
  // Options control 100 shares per contract unless told otherwise.
  .transform((plan) => ({
    ...plan,
    multiplier: plan.multiplier ?? (plan.assetClass === 'option' ? 100 : 1),
  }));

export function parseTradePlan(input) {
  return schema.safeParse(input);
}