import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseRuleChecks, parseStrategy, unmetRules } from '../strategy';

const errorsOf = (result) => z.flattenError(result.error).fieldErrors;

describe('parseStrategy', () => {
  const strategy = {
    name: '  15m BB acceptance ',
    description: 'Trend continuation after acceptance outside the 15m band.',
    rules: [
      { text: 'Accepted above the 15m band', kind: 'edge' },
      { text: 'Risk within my per-trade limit', kind: 'discipline' },
    ],
  };

  it('accepts a named strategy with its rules, trimming the text', () => {
    const result = parseStrategy(strategy);

    expect(result.success).toBe(true);
    expect(result.data.name).toBe('15m BB acceptance');
    expect(result.data.rules).toEqual(strategy.rules);
  });

  it('needs a name and at least one rule', () => {
    const errors = errorsOf(parseStrategy({ ...strategy, name: ' ', rules: [] }));

    expect(errors).toHaveProperty('name');
    expect(errors).toHaveProperty('rules');
  });

  it('rejects a blank rule or an unknown kind', () => {
    expect(parseStrategy({ ...strategy, rules: [{ text: ' ', kind: 'edge' }] }).success).toBe(false);
    expect(parseStrategy({ ...strategy, rules: [{ text: 'x', kind: 'vibes' }] }).success).toBe(false);
  });

  it("keeps an existing rule's id, so editing it keeps its history", () => {
    const id = '6f1c2a4e-0000-4000-8000-000000000001';
    const result = parseStrategy({ ...strategy, rules: [{ id, text: 'Reworded', kind: 'edge' }] });

    expect(result.data.rules).toEqual([{ id, text: 'Reworded', kind: 'edge' }]);
    expect(parseStrategy({ ...strategy, rules: [{ id: 'nope', text: 'x', kind: 'edge' }] }).success).toBe(false);
  });

  it('leaves the description optional', () => {
    expect(parseStrategy({ ...strategy, description: undefined }).data.description).toBeNull();
    expect(parseStrategy({ ...strategy, description: '  ' }).data.description).toBeNull();
  });
});

describe('parseRuleChecks', () => {
  const rules = [
    { id: 'r1', text: 'Accepted above the 15m band' },
    { id: 'r2', text: 'Not the first impulsive bar' },
  ];

  it('pairs each rule with whether it was met, keeping its text', () => {
    const result = parseRuleChecks({ r1: true, r2: false }, rules);

    expect(result).toEqual({
      success: true,
      data: [
        { ruleId: 'r1', ruleText: 'Accepted above the 15m band', met: true },
        { ruleId: 'r2', ruleText: 'Not the first impulsive bar', met: false },
      ],
    });
  });

  it('needs an answer for every rule', () => {
    const result = parseRuleChecks({ r1: true }, rules);

    expect(result.success).toBe(false);
    expect(errorsOf(result).ruleChecks).toEqual(['Answer every rule on the checklist']);
  });

  it('ignores answers for rules that are not on the checklist', () => {
    expect(parseRuleChecks({ r1: true, r2: true, other: false }, rules).data).toHaveLength(2);
  });
});

describe('unmetRules', () => {
  it('lists the text of the rules not met', () => {
    expect(
      unmetRules([
        { ruleText: 'A', met: true },
        { ruleText: 'B', met: false },
      ])
    ).toEqual(['B']);
  });
});
