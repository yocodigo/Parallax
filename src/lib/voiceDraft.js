import { z } from 'zod';
import { EMOTIONS, MISTAKES, parseJournalEntry } from './journalEntry';
import { parseTradePlan } from './tradePlan';

// The shape Claude fills in from a transcript. Every field is required and
// null when the note didn't say, so a missing price is never guessed. The
// real rules (stop on the losing side, a thesis needs a symbol, ...) are
// checked afterwards by the same parsers the forms use.
export const draftOutputSchema = z.object({
  kind: z.enum(['plan', 'review']).describe('plan: a trade they intend to make. review: looking back.'),
  symbol: z.string().nullable().describe('Ticker the note is about, if any'),
  notes: z.string().describe("The trader's reasoning in their own words, without filler"),
  emotion: z.enum(EMOTIONS).nullable().describe('Only if they say how they feel'),
  mistakes: z.array(z.enum(MISTAKES)).describe('Only mistakes they admit to'),
  plan: z
    .object({
      mode: z.enum(['live', 'paper', 'backtest']).nullable(),
      symbol: z.string().nullable(),
      assetClass: z.enum(['stock', 'option', 'crypto']).nullable(),
      direction: z.enum(['long', 'short']).nullable(),
      quantity: z.number().nullable(),
      plannedEntry: z.number().nullable(),
      initialStop: z.number().nullable(),
      target: z.number().nullable(),
    })
    .nullable()
    .describe('For a plan only; null for a review'),
});

const withoutNulls = (object) =>
  Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null));

const fieldErrorsOf = (result) => (result.success ? {} : z.flattenError(result.error).fieldErrors);

// Turns Claude's output into values to prefill the plan or review form, plus
// the errors those values would get if saved as-is, in the same
// { plan, entry } shape the plans route returns.
export function toDraft(output) {
  if (output.kind === 'plan') {
    const plan = withoutNulls(output.plan ?? {});
    const entry = withoutNulls({ notes: output.notes, emotion: output.emotion });
    entry.mistakes = [];

    return {
      draft: { kind: 'plan', plan, entry },
      fieldErrors: {
        plan: fieldErrorsOf(parseTradePlan(plan)),
        entry: fieldErrorsOf(parseJournalEntry({ ...entry, kind: 'plan' })),
      },
    };
  }

  const entry = withoutNulls({
    notes: output.notes,
    symbol: output.symbol,
    emotion: output.emotion,
    mistakes: output.mistakes,
  });

  return {
    draft: { kind: 'review', plan: null, entry },
    fieldErrors: { plan: {}, entry: fieldErrorsOf(parseJournalEntry({ ...entry, kind: 'review' })) },
  };
}
