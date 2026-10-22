import { z } from 'zod';

export const RULE_KINDS = ['edge', 'discipline'];

const strategySchema = z.object({
  name: z.string().trim().min(1, 'Name the strategy').max(80),
  // Blank is the same as none.
  description: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((value) => value || null),
  // In checklist order.
  rules: z
    .array(
      z.object({
        // Set for a rule that already exists, so editing keeps its history.
        id: z.uuid().optional(),
        text: z.string().trim().min(1, 'A rule needs some text').max(300),
        kind: z.enum(RULE_KINDS),
      })
    )
    .min(1, 'Add at least one rule'),
});

// Body of creating or replacing a strategy: { name, description?, rules }.
export function parseStrategy(input) {
  return strategySchema.safeParse(input);
}

// The checklist answered at entry: { [ruleId]: met } for every one of
// `rules` (the trade's strategy rules). Returns the checks to store, each with
// the rule's text, or an error if any rule went unanswered.
export function parseRuleChecks(input, rules) {
  const answers = input ?? {};
  return z
    .custom(() => rules.every((rule) => typeof answers[rule.id] === 'boolean'), {
      message: 'Answer every rule on the checklist',
      path: ['ruleChecks'],
    })
    .transform(() => rules.map((rule) => ({ ruleId: rule.id, ruleText: rule.text, met: answers[rule.id] })))
    .safeParse(answers);
}

// The text of each rule a trade was entered without.
export const unmetRules = (checks) => checks.filter((check) => !check.met).map((check) => check.ruleText);
