import { z } from 'zod';

// Every limit off, counting live trades: what a trader starts with.
export const DEFAULT_BREAKER_SETTINGS = {
  maxDailyLossR: null,
  maxTradesPerDay: null,
  cooldownAfterLosses: null,
  cooldownMinutes: null,
  modes: ['live'],
};

// A limit left out or null is off.
const limit = (schema) => schema.positive().nullable().default(null);
const count = () => limit(z.number().int());

const schema = z
  .object({
    maxDailyLossR: limit(z.number()),
    maxTradesPerDay: count(),
    cooldownAfterLosses: count(),
    cooldownMinutes: count(),
    modes: z
      .array(z.enum(['live', 'paper', 'backtest']))
      .min(1, 'Choose at least one mode')
      .transform((modes) => [...new Set(modes)]),
  })
  // The cool-down needs both how many losses start it and how long it lasts.
  .superRefine((settings, ctx) => {
    if (settings.cooldownAfterLosses !== null && settings.cooldownMinutes === null) {
      ctx.addIssue({ code: 'custom', path: ['cooldownMinutes'], message: 'Set how long the cool-down lasts' });
    }
    if (settings.cooldownMinutes !== null && settings.cooldownAfterLosses === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['cooldownAfterLosses'],
        message: 'Set how many losses in a row start the cool-down',
      });
    }
  });

export function parseBreakerSettings(input) {
  return schema.safeParse(input);
}
