import { describe, expect, it } from 'vitest';
import {
  EMOTION_LABELS,
  EMOTIONS,
  MISTAKE_LABELS,
  MISTAKES,
  parseJournalEntry,
} from '../journalEntry';

const review = { kind: 'review', notes: 'Held past my target and gave back half the move.' };

// Field paths of every validation error, e.g. ['notes'] or ['mistakes.0'].
const errorPaths = (result) => result.error.issues.map((issue) => issue.path.join('.'));

describe('parseJournalEntry', () => {
  it('accepts a minimal entry and defaults mistakes to an empty list', () => {
    const result = parseJournalEntry(review);

    expect(result.success).toBe(true);
    expect(result.data.mistakes).toEqual([]);
  });

  it('trims notes and rejects notes that are only whitespace', () => {
    expect(parseJournalEntry({ ...review, notes: '  Calm session.  ' }).data.notes).toBe(
      'Calm session.'
    );
    expect(errorPaths(parseJournalEntry({ ...review, notes: '   ' }))).toContain('notes');
  });

  it('requires a symbol for a thesis', () => {
    const thesis = { kind: 'thesis', notes: 'Long-term bet on data center demand.' };

    expect(errorPaths(parseJournalEntry(thesis))).toContain('symbol');
    expect(parseJournalEntry({ ...thesis, symbol: 'nvda' }).data.symbol).toBe('NVDA');
  });

  it('accepts only known emotions', () => {
    expect(parseJournalEntry({ ...review, emotion: 'fomo' }).success).toBe(true);
    expect(errorPaths(parseJournalEntry({ ...review, emotion: 'bored' }))).toContain('emotion');
  });

  it('accepts the impatient and regretful emotions', () => {
    expect(parseJournalEntry({ ...review, emotion: 'impatient' }).success).toBe(true);
    expect(parseJournalEntry({ ...review, emotion: 'regretful' }).success).toBe(true);
  });

  it('accepts the entered_before_confirmation, mid_range_entry, and entered_in_lockout mistakes', () => {
    const result = parseJournalEntry({
      ...review,
      mistakes: ['entered_before_confirmation', 'mid_range_entry', 'entered_in_lockout'],
    });

    expect(result.success).toBe(true);
  });

  it('accepts only known mistakes and removes duplicates', () => {
    const result = parseJournalEntry({
      ...review,
      mistakes: ['entered_late', 'entered_late', 'held_past_target'],
    });

    expect(result.data.mistakes).toEqual(['entered_late', 'held_past_target']);
    expect(errorPaths(parseJournalEntry({ ...review, mistakes: ['bad_luck'] }))).toContain(
      'mistakes.0'
    );
  });

  it('accepts only the trade modes', () => {
    expect(parseJournalEntry({ ...review, mode: 'backtest' }).data.mode).toBe('backtest');
    expect(errorPaths(parseJournalEntry({ ...review, mode: 'demo' }))).toEqual(['mode']);
  });

  it('rejects a trade link that is not a valid id', () => {
    expect(errorPaths(parseJournalEntry({ ...review, tradeId: 'abc' }))).toContain('tradeId');
  });

  it('accepts emotionalControl from 1 to 10 on a review, and only on a review', () => {
    expect(parseJournalEntry({ ...review, emotionalControl: 1 }).success).toBe(true);
    expect(parseJournalEntry({ ...review, emotionalControl: 10 }).success).toBe(true);
    expect(errorPaths(parseJournalEntry({ ...review, emotionalControl: 0 }))).toContain(
      'emotionalControl'
    );
    expect(errorPaths(parseJournalEntry({ ...review, emotionalControl: 11 }))).toContain(
      'emotionalControl'
    );
    expect(errorPaths(parseJournalEntry({ ...review, emotionalControl: 5.5 }))).toContain(
      'emotionalControl'
    );

    const plan = { kind: 'plan', notes: 'Breaking out of the range.', emotionalControl: 7 };
    expect(errorPaths(parseJournalEntry(plan))).toContain('emotionalControl');
  });
});

describe('labels', () => {
  // Adding an emotion or mistake without a label would show a blank on the page.
  it('has exactly one label for every emotion and mistake', () => {
    expect(Object.keys(EMOTION_LABELS)).toEqual(EMOTIONS);
    expect(Object.keys(MISTAKE_LABELS)).toEqual(MISTAKES);
  });
});
