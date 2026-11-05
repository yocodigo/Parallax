import { describe, expect, it } from 'vitest';
import { backfillFetches } from '../backfill';

const trade = (id, symbol, openedAt, assetClass = 'option') => ({ id, symbol, assetClass, openedAt: new Date(openedAt) });

describe('backfillFetches', () => {
  it('fetches once per symbol and New York day, up to the latest fill among them', () => {
    const { fetches } = backfillFetches([
      trade('b', 'SPY', '2026-10-27T15:00:00Z'),
      trade('a', 'SPY', '2026-10-27T14:00:00Z'),
      trade('c', 'QQQ', '2026-10-27T14:30:00Z'),
      // 9 PM New York on the 27th: still the 27th there, the 28th in UTC.
      trade('d', 'SPY', '2026-10-28T01:00:00Z', 'stock'),
      trade('e', 'SPY', '2026-10-28T14:00:00Z'),
    ]);

    expect(fetches.map((f) => [f.symbol, f.end.toISOString(), f.trades.map((t) => t.id)])).toEqual([
      ['SPY', '2026-10-28T01:00:00.000Z', ['b', 'a', 'd']],
      ['QQQ', '2026-10-27T14:30:00.000Z', ['c']],
      ['SPY', '2026-10-28T14:00:00.000Z', ['e']],
    ]);
  });

  it('fetches nothing for crypto, whose snapshot never has the minute bars', () => {
    const btc = trade('x', 'BTC/USD', '2026-10-27T14:00:00Z', 'crypto');

    expect(backfillFetches([btc])).toEqual({ withoutBars: [btc], fetches: [] });
  });
});
