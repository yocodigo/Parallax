import { describe, expect, it } from 'vitest';
import { adherence } from '../adherence';

// A closed long option with the given contracts, net P/L, and entry time.
function option(net, { quantity = 1, openedAt = '2026-04-13T14:00:00Z' } = {}) {
  return {
    direction: 'long',
    quantity,
    multiplier: 100,
    entryPrice: 1,
    exitPrice: 1 + net / (100 * quantity),
    fees: 0,
    openedAt: new Date(openedAt),
    closedAt: new Date('2026-04-13T20:00:00Z'),
  };
}

// Lockouts are New York clock times (settings.js): 16:00Z is 12:00 there,
// inside the 11:00-14:00 window; 14:00Z is 10:00, outside every window.
const LOCKED = '2026-04-13T16:00:00Z';
const FREE = '2026-04-13T14:00:00Z';

describe('adherence', () => {
  it('counts trades that held the window and size rules, and what the violations cost', () => {
    const result = adherence([
      option(50, { openedAt: FREE }),
      option(-30, { openedAt: LOCKED }),
      option(-20, { openedAt: FREE, quantity: 3 }),
      option(10, { openedAt: LOCKED, quantity: 3 }),
    ]);

    expect(result.trades).toBe(4);
    expect(result.window).toEqual({ ok: 2, missed: 2, cost: -20 });
    expect(result.size).toEqual({ ok: 2, missed: 2, cost: -10 });
  });

  it('leaves out trades that were never closed', () => {
    const open = { ...option(10), closedAt: null, exitPrice: null };
    expect(adherence([open]).trades).toBe(0);
  });

  it('returns zeros for no trades', () => {
    expect(adherence([])).toEqual({
      trades: 0,
      window: { ok: 0, missed: 0, cost: 0 },
      size: { ok: 0, missed: 0, cost: 0 },
    });
  });
});
