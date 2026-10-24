import { describe, expect, it } from 'vitest';
import { matchImport } from '../matchImport';

const CONTRACT = {
  symbol: 'SPY',
  assetClass: 'option',
  optionType: 'put',
  strike: 761,
  expiration: '2026-10-23',
  multiplier: 100,
};

// A closed round trip as pairFills returns it, entered at `openedAt` (UTC).
const imported = (openedAt, overrides = {}) => ({
  ...CONTRACT,
  direction: 'long',
  quantity: 1,
  entryPrice: 1.3,
  openedAt: new Date(openedAt),
  exitPrice: 1.17,
  closedAt: new Date(new Date(openedAt).getTime() + 60_000),
  fees: 1.32,
  refs: ['1', '2'],
  fillCount: 2,
  ...overrides,
});

// A trade already in the journal: a plan unless given an entry.
const existing = (id, overrides = {}) => ({
  id,
  mode: 'live',
  ...CONTRACT,
  direction: 'long',
  quantity: 1,
  plannedEntry: 1.25,
  entryPrice: null,
  openedAt: null,
  exitPrice: null,
  closedAt: null,
  fees: 0,
  createdAt: new Date('2026-10-23T18:00:00Z'),
  ...overrides,
});

const FILL_FIELDS = ['quantity', 'entryPrice', 'openedAt', 'exitPrice', 'closedAt', 'fees'];
const factsOf = (trade) => Object.fromEntries(FILL_FIELDS.map((field) => [field, trade[field]]));

describe('matchImport', () => {
  it('creates a trade in the chosen mode when nothing in the journal matches', () => {
    const trade = imported('2026-10-23T18:41:05Z');

    expect(matchImport([trade], [], { mode: 'live' })).toEqual([
      // Only what the trades table stores: not the refs or the fill count.
      {
        action: 'create',
        imported: trade,
        values: { ...CONTRACT, direction: 'long', ...factsOf(trade), mode: 'live' },
      },
    ]);
  });

  it("fills in a plan for the same contract written earlier that New York day", () => {
    const trade = imported('2026-10-23T18:41:05Z');

    expect(matchImport([trade], [existing('plan-1')], { mode: 'live' })).toEqual([
      { action: 'fill', imported: trade, tradeId: 'plan-1', values: factsOf(trade) },
    ]);
  });

  it("replaces a hand-recorded entry within 5 minutes with the broker's exact fills", () => {
    const trade = imported('2026-10-23T18:41:05Z');
    const handRecorded = existing('trade-1', {
      entryPrice: 1.3,
      openedAt: new Date('2026-10-23T18:41:00Z'),
    });

    expect(matchImport([trade], [handRecorded], { mode: 'live' })).toEqual([
      { action: 'fill', imported: trade, tradeId: 'trade-1', values: factsOf(trade) },
    ]);
  });

  it('skips a trade imported before, entered at the very same second', () => {
    const trade = imported('2026-10-23T18:41:05Z');
    const already = existing('trade-1', { ...factsOf(trade) });

    expect(matchImport([trade], [already], { mode: 'live' })).toEqual([
      { action: 'skip', imported: trade, tradeId: 'trade-1' },
    ]);
  });

  it('fills each plan only once, the earliest trade first', () => {
    const first = imported('2026-10-23T18:41:05Z');
    const second = imported('2026-10-23T18:47:53Z');

    const actions = matchImport([first, second], [existing('plan-1')], { mode: 'live' });

    expect(actions.map((a) => [a.action, a.tradeId])).toEqual([
      ['fill', 'plan-1'],
      ['create', undefined],
    ]);
  });

  it('matches only the same mode, contract, and direction', () => {
    const trade = imported('2026-10-23T18:41:05Z');
    const others = [
      existing('paper', { mode: 'paper' }),
      existing('call', { optionType: 'call' }),
      existing('strike', { strike: 760 }),
      existing('expiry', { expiration: '2026-10-24' }),
      existing('symbol', { symbol: 'QQQ' }),
      existing('short', { direction: 'short' }),
    ];

    expect(matchImport([trade], others, { mode: 'live' })[0].action).toBe('create');
  });

  it('leaves alone plans from another day, plans written after the fill, and entries further apart', () => {
    const trade = imported('2026-10-23T18:41:05Z');
    const others = [
      // Oct 22 in New York, though Oct 23 in UTC.
      existing('yesterday', { createdAt: new Date('2026-10-23T03:00:00Z') }),
      existing('after', { createdAt: new Date('2026-10-23T18:50:00Z') }),
      existing('later', { entryPrice: 1.3, openedAt: new Date('2026-10-23T18:47:00Z') }),
    ];

    expect(matchImport([trade], others, { mode: 'live' })[0].action).toBe('create');
  });

  it('fills a hand-recorded entry before an unentered plan', () => {
    const trade = imported('2026-10-23T18:41:05Z');
    const handRecorded = existing('trade-1', { entryPrice: 1.3, openedAt: new Date('2026-10-23T18:42:00Z') });

    const [action] = matchImport([trade], [existing('plan-1'), handRecorded], { mode: 'live' });

    expect(action.tradeId).toBe('trade-1');
  });
});
