import { z } from 'zod';

// What setups.md 9.6 shows next to the record button, until Joel edits them.
export const DEFAULT_RECORDING_PROMPTS = {
  preTradePrompt: `Say in a few seconds:
- Direction + instrument (e.g. "SPY, long, 681 calls")
- Setup (15m cross, 4xBO, reversal...)
- Stop (where you're wrong)
- Target (first fib level)`,
  endOfDayPrompt: `For each trade or the day:
- Emotional state before entering (calm, FOMO, impatient)
- Did I follow my rules? If not, which one broke?
- What did I do well?
- What would I change?
- Emotional-control score 1-10`,
  micTips: 'Quiet room, say numbers clearly ("six eighty-one"), state ticker + direction first, keep it short.',
};

const schema = z.object({
  preTradePrompt: z.string().trim().min(1),
  endOfDayPrompt: z.string().trim().min(1),
  micTips: z.string().trim().min(1),
});

export function parseRecordingPrompts(input) {
  return schema.safeParse(input);
}
