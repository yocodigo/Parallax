import { z } from 'zod';
import { getTimeframe, maxDaysFor } from './timeframes';


const schema = z.object({
  symbols: z
    .string()
    .transform((s) =>
      s.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, 10)
    )
    .refine((arr) => arr.length > 0, 'At least one symbol is required')
    .refine(
      (arr) => arr.every((s) => /^[A-Z.]{1,6}$/.test(s)),
      'Invalid symbol format'
    ),
  timeframe: z
    .string()
    .refine((tf) => getTimeframe(tf) !== null, 'Unsupported timeframe'),
  days: z.coerce.number().int().positive(),
    })
    // Clamp the window to the chosen timeframe's cap rather than rejecting,
    // so an over-long request returns the max valid window instead of an error.
    .transform((data) => {
      const cap = maxDaysFor(data.timeframe);
    return { ...data, days: Math.min(data.days, cap) };
});

export function parseBarsParams(searchParams) {
  return schema.safeParse({
    symbols: searchParams.get('symbols') || 'AAPL,MSFT,SPY',
    timeframe: searchParams.get('timeframe') || '1Day',
    days: searchParams.get('days') || 90,
  });
}