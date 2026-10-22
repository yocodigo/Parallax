import { describe, expect, it } from 'vitest';
import { formatEntries, reviewWindowStart } from '../weeklyReview';

const trade = {
  mode: 'paper',
  symbol: 'NVDA',
  assetClass: 'stock',
  direction: 'long',
  quantity: 100,
  plannedEntry: 180,
  initialStop: 175,
  target: 190,
  entryPrice: null,
  exitPrice: null,
  openedAt: null,
  closedAt: null,
};

function entry(overrides = {}) {
  return {
    kind: 'review',
    symbol: null,
    notes: 'Quiet day.',
    emotion: null,
    mistakes: [],
    trade: null,
    // 2:30 PM in New York.
    createdAt: new Date('2026-10-20T18:30:00Z'),
    ...overrides,
  };
}

describe('reviewWindowStart', () => {
  it('starts seven days before now', () => {
    expect(reviewWindowStart(new Date('2026-10-22T12:00:00Z'))).toEqual(
      new Date('2026-10-15T12:00:00Z')
    );
  });
});

describe('formatEntries', () => {
  it('writes each entry with its New York date, kind, and notes', () => {
    expect(formatEntries([entry()])).toBe(
      '<entry date="Tue, Oct 20" kind="review">\nNotes: Quiet day.\n</entry>'
    );
  });

  it('uses the New York date for entries logged late in the evening', () => {
    // 10 PM Tuesday in New York is already Wednesday in UTC.
    const late = entry({ createdAt: new Date('2026-10-21T02:00:00Z') });

    expect(formatEntries([late])).toContain('date="Tue, Oct 20"');
  });

  it('spells out the symbol, feeling, and mistakes', () => {
    const text = formatEntries([
      entry({ symbol: 'NVDA', emotion: 'fomo', mistakes: ['moved_stop', 'oversized'] }),
    ]);

    expect(text).toContain('symbol="NVDA"');
    expect(text).toContain('Feeling: FOMO');
    expect(text).toContain('Mistakes: Moved stop, Oversized');
  });

  it('describes a planned trade with its levels', () => {
    const text = formatEntries([entry({ kind: 'plan', trade })]);

    expect(text).toContain(
      'Trade: paper long 100 NVDA stock, planned. Planned entry 180, stop 175, target 190.'
    );
  });

  it('describes a closed trade with its fills', () => {
    const closed = {
      ...trade,
      target: null,
      entryPrice: 181,
      exitPrice: 175,
      openedAt: new Date('2026-10-19T14:00:00Z'),
      closedAt: new Date('2026-10-20T15:00:00Z'),
    };

    expect(formatEntries([entry({ trade: closed })])).toContain(
      'Trade: paper long 100 NVDA stock, closed. Planned entry 180, stop 175, filled at 181, exited at 175.'
    );
  });

  it('lists entries oldest first, so the review follows the week in order', () => {
    const text = formatEntries([
      entry({ notes: 'Thursday', createdAt: new Date('2026-10-22T18:00:00Z') }),
      entry({ notes: 'Monday', createdAt: new Date('2026-10-19T18:00:00Z') }),
    ]);

    expect(text.indexOf('Monday')).toBeLessThan(text.indexOf('Thursday'));
  });
});
