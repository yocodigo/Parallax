import { describe, expect, it } from 'vitest';
import { formatContract, formatHold, formatTradeTime, byOpenedAtDesc, formatProfitLoss, formatR } from '../format';

describe('formatHold', () => {
  it('shows minutes, then hours and minutes, then days and hours', () => {
    expect(formatHold(0.4)).toBe('<1m');
    expect(formatHold(1.8)).toBe('2m');
    expect(formatHold(59)).toBe('59m');
    expect(formatHold(135)).toBe('2h 15m');
    expect(formatHold(120)).toBe('2h');
    expect(formatHold(26 * 60)).toBe('1d 2h');
  });

  it('is a dash when there is no hold time', () => {
    expect(formatHold(null)).toBe('—');
  });
});

describe('formatProfitLoss', () => {
  it('signs dollars', () => {
    expect(formatProfitLoss(998)).toBe('+$998.00');
    expect(formatProfitLoss(-500)).toBe('-$500.00');
  });
});

describe('formatR', () => {
  it('signs R to one decimal', () => {
    expect(formatR(2)).toBe('+2.0R');
    expect(formatR(-1)).toBe('-1.0R');
  });
});

describe('formatContract', () => {
  it('reads like an option chain: strike, C or P, and expiration', () => {
    expect(formatContract({ optionType: 'call', strike: 500, expiration: '2026-01-16' })).toBe('500C exp Jan 16');
    expect(formatContract({ optionType: 'put', strike: 412.5, expiration: '2026-10-23' })).toBe('412.5P exp Oct 23');
  });

  it("doesn't shift the expiration date by time zone", () => {
    // Parsed as UTC midnight, this would show as Dec 31 west of Greenwich.
    expect(formatContract({ optionType: 'call', strike: 5, expiration: '2027-01-01' })).toBe('5C exp Jan 1');
  });

  it('is empty without a contract', () => {
    expect(formatContract({ optionType: null, strike: null, expiration: null })).toBe('');
  });
});

describe('formatTradeTime', () => {
  it('shows the fill time in New York', () => {
    expect(formatTradeTime('2026-11-10T15:43:00.000Z')).toBe('10:43 AM');
    expect(formatTradeTime('2026-07-10T18:05:00.000Z')).toBe('2:05 PM');
  });

  it('is empty for a trade with no fill', () => {
    expect(formatTradeTime(null)).toBe('');
  });
});

describe('byOpenedAtDesc', () => {
  it('puts the latest fill first and unfilled trades last, keeping their order', () => {
    const trades = [
      { id: 1, openedAt: null },
      { id: 2, openedAt: '2026-11-10T15:00:00.000Z' },
      { id: 3, openedAt: null },
      { id: 4, openedAt: '2026-11-10T16:30:00.000Z' },
    ];
    expect([...trades].sort(byOpenedAtDesc).map((t) => t.id)).toEqual([4, 2, 1, 3]);
  });
});
