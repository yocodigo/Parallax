import { z } from 'zod';
import { BACKSTOP_PCT, LOCKOUTS, PREMIUM_MIN, SIZE_MAX, SIZE_MIN, TIME_STOP } from './setups/settings';

// The option rules as the trader's settings (rules-v3 section 5): each has an
// on flag and its values, kept while it is off. The windows are New York
// times, the clock the app keeps. Risk per trade is null (not set) until the
// winners' heat gives it a number. Thresholds of the detectors stay in
// settings.js.
export const DEFAULT_RULE_SETTINGS = {
  windowsOn: true,
  windows: LOCKOUTS,
  sizeOn: true,
  sizeMin: SIZE_MIN,
  sizeMax: SIZE_MAX,
  premiumBandOn: true,
  premiumMin: PREMIUM_MIN,
  premiumMax: null,
  riskPerTrade: null,
  backstopOn: true,
  backstopPct: BACKSTOP_PCT,
  timeStopOn: true,
  timeStopMinutes: TIME_STOP,
};

const D = DEFAULT_RULE_SETTINGS;

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30');
// HH:MM strings compare in clock order.
const timeWindow = z
  .tuple([clock, clock])
  .refine(([from, to]) => from < to, 'A window must end after it starts');

const schema = z
  .object({
    windowsOn: z.boolean().default(D.windowsOn),
    windows: z.array(timeWindow).default(D.windows),
    sizeOn: z.boolean().default(D.sizeOn),
    sizeMin: z.number().int().min(1).default(D.sizeMin),
    sizeMax: z.number().int().min(1).default(D.sizeMax),
    premiumBandOn: z.boolean().default(D.premiumBandOn),
    premiumMin: z.number().positive().default(D.premiumMin),
    premiumMax: z.number().positive().nullable().default(D.premiumMax),
    riskPerTrade: z.number().positive().nullable().default(D.riskPerTrade),
    backstopOn: z.boolean().default(D.backstopOn),
    backstopPct: z.number().gt(0).lt(1).default(D.backstopPct),
    timeStopOn: z.boolean().default(D.timeStopOn),
    timeStopMinutes: z.number().int().positive().default(D.timeStopMinutes),
  })
  .superRefine((settings, ctx) => {
    if (settings.sizeMax < settings.sizeMin) {
      ctx.addIssue({ code: 'custom', path: ['sizeMax'], message: 'The most contracts can’t be below the fewest' });
    }
    if (settings.premiumMax !== null && settings.premiumMax <= settings.premiumMin) {
      ctx.addIssue({ code: 'custom', path: ['premiumMax'], message: 'The top of the band must be above its bottom' });
    }
  });

export function parseRuleSettings(input) {
  return schema.safeParse(input);
}
