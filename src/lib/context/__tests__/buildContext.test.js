import { describe, expect, it } from 'vitest';
import { buildContext } from '../buildContext';

// Entered at 10:30 AM New York time on Tuesday, Oct 20, 2026.
const openedAt = new Date('2026-10-20T14:30:00Z');

// 60 daily bars before the entry day, rising by 1 a day to `last`, each with
// 1.3M shares traded.
const dailyRising = (last) =>
  Array.from({ length: 60 }, (_, i) => ({ t: `day-${i}`, c: last - 59 + i, v: 1_300_000 }));

// Minute bars on the entry day: the 9:30 open at `open`, then one an hour
// later at `price`, 200k shares each.
const intraday = (open, price) => [
  { t: '2026-10-20T13:30:00Z', o: open, c: open, v: 200_000 },
  { t: '2026-10-20T14:29:00Z', o: price, c: price, v: 200_000 },
];

const stockTrade = { symbol: 'NVDA', assetClass: 'stock', openedAt };

const raw = {
  daily: { SPY: dailyRising(560), QQQ: dailyRising(480), NVDA: dailyRising(180) },
  intraday: { SPY: intraday(561, 562), QQQ: intraday(481, 482), NVDA: intraday(183, 190) },
  vixRows: [
    { date: '2026-10-12', close: 15 },
    { date: '2026-10-13', close: 15 },
    { date: '2026-10-14', close: 15.4 },
    { date: '2026-10-15', close: 16 },
    { date: '2026-10-16', close: 16.5 },
    { date: '2026-10-19', close: 17 },
  ],
  option: null,
};

describe('buildContext', () => {
  it('captures the market, the stock, and the time of day at entry', () => {
    const context = buildContext({ trade: stockTrade, now: openedAt, ...raw });

    expect(context).toMatchObject({
      version: 1,
      capturedAt: openedAt.toISOString(),
      timeOfDay: { sessionPart: 'midday', minutesSinceOpen: 60 },
      market: {
        spyTrend: 'up',
        qqqTrend: 'up',
        vix: { close: 17, date: '2026-10-19', direction: 'rising' },
      },
      stock: { symbol: 'NVDA', price: 190, trend: 'up' },
      option: null,
    });
    // Opened at 183 against a 180 close.
    expect(context.stock.gapPercent).toBeCloseTo(1.67, 2);
    // 400k by 60 minutes in, against 1.3M x 60/390 = 200k expected.
    expect(context.stock.relativeVolume).toBeCloseTo(2, 2);
    // NVDA from 161 to 190 (+18.0%) against SPY from 541 to 562 (+3.9%).
    expect(context.stock.relativeStrength).toBeCloseTo(14.13, 1);
  });

  it('uses only bars that ended by the entry, since a bar is stamped with its start', () => {
    // Filled at 10:30:45; the 10:30 bar runs to 10:31, after the fill.
    const midMinute = new Date('2026-10-20T14:30:45Z');
    const bars = [...intraday(183, 190), { t: '2026-10-20T14:30:00Z', o: 190, c: 195, v: 900_000 }];

    const context = buildContext({
      trade: { ...stockTrade, openedAt: midMinute },
      now: midMinute,
      ...raw,
      intraday: { ...raw.intraday, NVDA: bars },
    });

    expect(context.stock.price).toBe(190);
    expect(context.stock.relativeVolume).toBeCloseTo(2, 2);
  });

  it('marks the scheduled releases as unknown outside the covered dates', () => {
    expect(buildContext({ trade: stockTrade, now: openedAt, ...raw }).market.events).toBeNull();
  });

  it('lists the releases on and after a covered entry date', () => {
    const late = new Date('2026-11-05T15:00:00Z');

    const context = buildContext({ trade: { ...stockTrade, openedAt: late }, now: late, ...raw });

    expect(context.market.events).toEqual({ today: [], nextWeekday: ['Jobs report'] });
  });

  it('leaves out what could not be fetched', () => {
    const context = buildContext({
      trade: stockTrade,
      now: openedAt,
      daily: {},
      intraday: {},
      vixRows: null,
      option: null,
    });

    expect(context.market).toMatchObject({ spyTrend: null, qqqTrend: null, vix: null });
    expect(context.stock).toMatchObject({ price: null, trend: null, gapPercent: null, relativeVolume: null });
  });

  it('says what the snapshot never has', () => {
    expect(buildContext({ trade: stockTrade, now: openedAt, ...raw }).unavailable).toEqual([
      'sectorTrend',
      'earnings',
      'exDividend',
      'ivRank',
    ]);
  });

  describe('for an option', () => {
    const optionTrade = {
      symbol: 'NVDA',
      assetClass: 'option',
      optionType: 'call',
      strike: 195,
      expiration: '2026-10-23',
      openedAt,
    };
    const option = { bid: 1.9, ask: 2.1, iv: 0.5, delta: 0.42, openInterest: 12_000 };

    it('captures the contract, days to expiration, and the live quote when recorded promptly', () => {
      const context = buildContext({ trade: optionTrade, now: new Date('2026-10-20T14:40:00Z'), ...raw, option });

      expect(context.option).toMatchObject({
        contract: 'NVDA261023C00195000',
        dte: 3,
        openInterest: 12_000,
        bid: 1.9,
        ask: 2.1,
        iv: 0.5,
        delta: 0.42,
        liveSkipped: false,
      });
      expect(context.option.spreadPercent).toBeCloseTo(10);
      // 190 x 0.5 x sqrt(77.5 hours from entry to 4 PM Friday / 8760 hours a year) = 8.94.
      expect(context.option.expectedMove).toBeCloseTo(8.94, 1);
      // The underlying's context is captured too.
      expect(context.stock.symbol).toBe('NVDA');
    });

    it('skips the live quote when the entry is recorded late, since it would not be the quote at entry', () => {
      const context = buildContext({ trade: optionTrade, now: new Date('2026-10-20T16:00:00Z'), ...raw, option });

      expect(context.option).toMatchObject({
        dte: 3,
        openInterest: 12_000,
        bid: null,
        ask: null,
        spreadPercent: null,
        iv: null,
        delta: null,
        expectedMove: null,
        liveSkipped: true,
      });
    });
  });
});
