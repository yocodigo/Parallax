import { describe, expect, it } from 'vitest';
import { filterJournal, isFiltering, NO_FILTERS } from '../journalFilters';

// A closed trade bought at 1.00 and sold at `exitPrice`, 1 contract x 100, $1.30 fees.
const trade = (id, overrides = {}) => ({
  id,
  mode: 'live',
  direction: 'long',
  quantity: 1,
  multiplier: 100,
  entryPrice: 1,
  exitPrice: 1.5,
  fees: 1.3,
  strategyId: null,
  openedAt: '2026-11-19T14:40:00Z',
  closedAt: '2026-11-19T14:52:00Z',
  ...overrides,
});
const entry = (id, kind, t, overrides = {}) => ({ id, kind, mode: t?.mode ?? 'live', tradeId: t?.id ?? null, trade: t, ...overrides });
const ids = (entries) => entries.map((e) => e.id);

describe('filterJournal', () => {
  const win = trade('win');
  const loss = trade('loss', { exitPrice: 0.5, strategyId: 's1' });
  // Gross $0 and $1.30 of fees: net negative, but a scratch.
  const scratch = trade('scratch', { exitPrice: 1, mode: 'paper' });
  const open = trade('open', { exitPrice: null, closedAt: null });
  const entries = [
    entry('p-win', 'plan', win),
    entry('r-win', 'review', win),
    entry('p-loss', 'plan', loss),
    entry('p-scratch', 'plan', scratch),
    entry('p-open', 'plan', open),
    entry('thesis', 'thesis', null, { mode: 'live' }),
    entry('thesis-paper', 'thesis', null, { mode: 'paper' }),
  ];

  it('keeps everything with no filters', () => {
    expect(filterJournal(entries, NO_FILTERS)).toEqual(entries);
    expect(isFiltering(NO_FILTERS)).toBe(false);
  });

  it('filters by mode, for trades and for entries with no trade', () => {
    expect(ids(filterJournal(entries, { ...NO_FILTERS, mode: 'paper' }))).toEqual(['p-scratch', 'thesis-paper']);
    expect(isFiltering({ ...NO_FILTERS, mode: 'paper' })).toBe(true);
  });

  it('filters closed trades by result on gross P/L, so a breakeven before fees is a scratch', () => {
    expect(ids(filterJournal(entries, { ...NO_FILTERS, result: 'win' }))).toEqual(['p-win', 'r-win']);
    expect(ids(filterJournal(entries, { ...NO_FILTERS, result: 'loss' }))).toEqual(['p-loss']);
    expect(ids(filterJournal(entries, { ...NO_FILTERS, result: 'scratch' }))).toEqual(['p-scratch']);
  });

  it('judges reviewed on every entry of the trade, and only for closed trades', () => {
    expect(ids(filterJournal(entries, { ...NO_FILTERS, reviewed: 'reviewed' }))).toEqual(['p-win', 'r-win']);
    expect(ids(filterJournal(entries, { ...NO_FILTERS, reviewed: 'unreviewed' }))).toEqual(['p-loss', 'p-scratch']);
  });

  it('filters by setup, with "none" for trades planned under no strategy', () => {
    expect(ids(filterJournal(entries, { ...NO_FILTERS, setup: 's1' }))).toEqual(['p-loss']);
    expect(ids(filterJournal(entries, { ...NO_FILTERS, setup: 'none' }))).toEqual(['p-win', 'r-win', 'p-scratch', 'p-open']);
  });

  it('drops entries with no trade whenever a trade-only filter is on', () => {
    expect(ids(filterJournal(entries, { ...NO_FILTERS, result: 'win' }))).not.toContain('thesis');
    expect(ids(filterJournal(entries, { ...NO_FILTERS, setup: 'none' }))).not.toContain('thesis');
  });

  it('combines filters', () => {
    expect(ids(filterJournal(entries, { ...NO_FILTERS, mode: 'live', result: 'loss', setup: 's1' }))).toEqual(['p-loss']);
    expect(filterJournal(entries, { ...NO_FILTERS, mode: 'paper', result: 'win' })).toEqual([]);
  });
});
