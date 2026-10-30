import { z } from 'zod';

// A starting checklist for the two recording modes (setups.md 9.6), until
// Joel edits them to fit how he actually talks through a trade.
export const DEFAULT_RECORDING_PROMPTS = {
  preTradePrompt: `Cover quickly:
- Which way, which instrument
- What you're seeing (the setup)
- Where you'd be wrong (stop)
- Where you'd take profit (target)`,
  endOfDayPrompt: `For the day or each trade:
- How you felt going in
- Whether you stuck to your plan, and where you didn't
- One thing that went right
- One thing to change next time
- Rate your composure, 1 to 10`,
  micTips: 'Find somewhere quiet, lead with the symbol and direction, and spell out numbers plainly.',
};

const schema = z.object({
  preTradePrompt: z.string().trim().min(1),
  endOfDayPrompt: z.string().trim().min(1),
  micTips: z.string().trim().min(1),
});

export function parseRecordingPrompts(input) {
  return schema.safeParse(input);
}
