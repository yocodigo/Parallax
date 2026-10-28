import { z } from 'zod';
import { symbolSchema } from './symbol';

// Stored as lowercase keys; the journal page shows friendly labels.
export const EMOTIONS = [
  'calm',
  'hesitant',
  'fomo',
  'fearful',
  'greedy',
  'frustrated',
  'overconfident',
  'impatient',
  'regretful',
];

export const MISTAKES = [
  'entered_late',
  'held_past_target',
  'held_past_stop',
  'moved_stop',
  'skipped_gate',
  'oversized',
  'revenge_trade',
  'exited_early',
  'entered_before_confirmation',
  'mid_range_entry',
  'entered_in_lockout',
];

export const EMOTION_LABELS = {
  calm: 'Calm',
  hesitant: 'Hesitant',
  fomo: 'FOMO',
  fearful: 'Fearful',
  greedy: 'Greedy',
  frustrated: 'Frustrated',
  overconfident: 'Overconfident',
  impatient: 'Impatient',
  regretful: 'Regretful',
};

export const MISTAKE_LABELS = {
  entered_late: 'Entered late',
  held_past_target: 'Held past target',
  held_past_stop: 'Held past stop',
  moved_stop: 'Moved stop',
  skipped_gate: 'Skipped the gate',
  oversized: 'Oversized',
  revenge_trade: 'Revenge trade',
  exited_early: 'Exited early',
  entered_before_confirmation: 'Entered before confirmation',
  mid_range_entry: 'Mid-range entry',
  entered_in_lockout: 'Entered in lockout',
};

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
    emotionalControl: z.int().min(1).max(10).optional(),
  })
  // A thesis is about a holding, so it has to say which one.
  .refine((entry) => entry.kind !== 'thesis' || entry.symbol !== undefined, {
    path: ['symbol'],
    message: 'A thesis needs a symbol',
  })
  // Emotional control rates how well a review went, not a plan or thesis.
  .refine((entry) => entry.kind === 'review' || entry.emotionalControl === undefined, {
    path: ['emotionalControl'],
    message: 'Emotional control is only for a review',
  });

export function parseJournalEntry(input) {
  return schema.safeParse(input);
}