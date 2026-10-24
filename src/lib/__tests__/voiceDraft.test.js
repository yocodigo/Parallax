import { describe, expect, it } from 'vitest';
import { draftOutputSchema, toDraft } from '../voiceDraft';

const emptyPlan = {
  mode: null,
  symbol: null,
  assetClass: null,
  direction: null,
  quantity: null,
  plannedEntry: null,
  initialStop: null,
  target: null,
};

// What Claude returns: every field present, null when the note didn't say.
function output(overrides = {}) {
  return draftOutputSchema.parse({
    kind: 'review',
    symbol: null,
    notes: 'Some notes',
    emotion: null,
    mistakes: [],
    plan: null,
    ...overrides,
  });
}

describe('toDraft', () => {
  it('turns a complete spoken plan into a plan with no errors', () => {
    const plan = {
      mode: 'paper',
      symbol: 'AAPL',
      assetClass: 'stock',
      direction: 'long',
      quantity: 100,
      plannedEntry: 210,
      initialStop: 205,
      target: 220,
    };

    const { draft, fieldErrors } = toDraft(
      output({ kind: 'plan', notes: 'Breakout over 210.', emotion: 'calm', plan })
    );

    expect(draft).toEqual({
      kind: 'plan',
      plan,
      entry: { notes: 'Breakout over 210.', emotion: 'calm', mistakes: [] },
    });
    expect(fieldErrors).toEqual({ plan: {}, entry: {} });
  });

  it('leaves out what the note did not say and reports what a plan still needs', () => {
    const { draft, fieldErrors } = toDraft(
      output({
        kind: 'plan',
        plan: { ...emptyPlan, symbol: 'TSLA', direction: 'short', plannedEntry: 250 },
      })
    );

    expect(draft.plan).toEqual({ symbol: 'TSLA', direction: 'short', plannedEntry: 250 });
    expect(draft.entry).not.toHaveProperty('emotion');
    // No stop is asked for yet: whether one is needed depends on the asset
    // class, which the note didn't say either.
    expect(Object.keys(fieldErrors.plan)).toEqual(expect.arrayContaining(['mode', 'assetClass', 'quantity']));
  });

  it('checks the stop is on the losing side, like a typed plan', () => {
    const { fieldErrors } = toDraft(
      output({
        kind: 'plan',
        plan: {
          ...emptyPlan,
          mode: 'paper',
          symbol: 'AAPL',
          assetClass: 'stock',
          direction: 'long',
          quantity: 10,
          plannedEntry: 210,
          initialStop: 215,
        },
      })
    );

    expect(fieldErrors.plan).toHaveProperty('initialStop');
  });

  it('turns a spoken review into a review with its mistakes', () => {
    const { draft, fieldErrors } = toDraft(
      output({
        notes: 'Moved my stop and got stopped out anyway.',
        symbol: 'NVDA',
        emotion: 'frustrated',
        mistakes: ['moved_stop'],
        plan: emptyPlan,
      })
    );

    expect(draft).toEqual({
      kind: 'review',
      plan: null,
      entry: {
        notes: 'Moved my stop and got stopped out anyway.',
        symbol: 'NVDA',
        emotion: 'frustrated',
        mistakes: ['moved_stop'],
      },
    });
    expect(fieldErrors).toEqual({ plan: {}, entry: {} });
  });
});
