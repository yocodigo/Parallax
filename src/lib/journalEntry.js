import { z } from 'zod';
import { symbolSchema } from './symbol';

// Stored as lowercase keys; the journal page shows friendly labels.
export const EMOTIONS = ['calm', 'hesitant', 'fomo', 'fearful', 'greedy', 'frustrated', 'overconfident'];

export const MISTAKES = [
  'entered_late',
  'held_past_target',
  'held_past_stop',
  'moved_stop',
  'skipped_gate',
  'oversized',
  'revenge_trade',
  'exited_early',
];

const schema = z
  .object({
    kind: z.enum(['plan', 'review', 'thesis']),
    tradeId: z.uuid().optional(),
    symbol: symbolSchema.optional(),
    notes: z.string().trim().min(1, 'Notes cannot be empty').max(10000),
    emotion: z.enum(EMOTIONS).optional(),
    mistakes: z
      .array(z.enum(MISTAKES))
      .default([])
      .transform((list) => [...new Set(list)]),
  })
  // A thesis is about a holding, so it has to say which one.
  .refine((entry) => entry.kind !== 'thesis' || entry.symbol !== undefined, {
    path: ['symbol'],
    message: 'A thesis needs a symbol',
  });

export function parseJournalEntry(input) {
  return schema.safeParse(input);
}