import { describe, expect, it } from 'vitest';
import { breakout } from '../../setups/__tests__/fixtures/fourTouch';
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
      version: 3,
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

  describe('setups', () => {
    // The four-touch example as 1m bars from the 9:30 open on Oct 27, 2026.
    const asMinutes = (ohlc) =>
      ohlc.map((bar, k) => ({ t: new Date(Date.parse('2026-10-27T13:30:00Z') + k * 60_000).toISOString(), v: 100, ...bar }));
    const putAt956 = {
      symbol: 'NVDA',
      assetClass: 'option',
      direction: 'long',
      optionType: 'put',
      strike: 180,
      expiration: '2026-10-30',
      openedAt: new Date('2026-10-27T09:56:00-04:00'),
    };
    // The underlying's own minute bars, fetched apart from the market's
    // (`minuteBars`), and its daily bars: the prior day's range 279 to 330.
    const daily = { ...raw.daily, NVDA: [{ t: '2026-10-26T04:00:00Z', o: 300, h: 330, l: 279, c: 300, v: 1_000_000 }] };
    const withBars = (trade, bars, extra = {}) =>
      buildContext({ trade, now: trade.openedAt, ...raw, daily, minuteBars: bars, ...extra });

    it('keeps the four-touch break the trade went with and its grade, from the underlying’s bars', () => {
      const bars = asMinutes(breakout);
      const context = withBars(putAt956, bars);

      expect(context.version).toBe(3);
      expect(context.setups.fourTouch).toMatchObject({
        timeframe: '1m',
        kind: '4xBD',
        status: 'valid',
        grade: { grade: 'A' },
        brokeAt: bars[22].t,
      });
    });

    it('keeps every setup detected the trade’s way, with how recent it was', () => {
      const bars = asMinutes(breakout);
      expect(withBars(putAt956, bars).setups.detected).toContainEqual({
        detector: 'four_touch',
        timeframe: '1m',
        direction: 'short',
        status: 'valid',
        grade: 'A',
        completedAt: bars[25].t,
        barsSince: 0,
      });
    });

    it('keeps the level map at the fill, with the day’s plan', () => {
      const { levels } = withBars(putAt956, asMinutes(breakout), { dailyPlan: { premarketHigh: 325 } });
      expect(levels).toContainEqual(expect.objectContaining({ kind: 'prior_day_low', price: 279, tier: 1 }));
      expect(levels).toContainEqual(expect.objectContaining({ kind: 'premarket_high', price: 325, tier: 1 }));
    });

    it('looks at the regular session only, as the entry review does', () => {
      // The breakdown happens in the pre-market, from 8:00; the session is
      // flat from the open to the fill.
      const preMarket = breakout.map((bar, k) => ({
        t: new Date(Date.parse('2026-10-27T12:00:00Z') + k * 60_000).toISOString(),
        v: 100,
        ...bar,
      }));
      const flatSession = asMinutes(Array.from({ length: 26 }, () => ({ o: 280, h: 281, l: 279, c: 280 })));

      const { setups } = withBars(putAt956, [...preMarket, ...flatSession]);
      expect(setups.fourTouch).toBeNull();
      expect(setups.detected).toEqual([]);
    });

    it('reads nothing after the fill, so bars fetched past it change nothing', () => {
      const bars = asMinutes(breakout);
      // Before the break (bar 22, 9:52), just after it, and well after.
      for (const time of ['09:50', '09:53', '09:56']) {
        const trade = { ...putAt956, openedAt: new Date(`2026-10-27T${time}:00-04:00`) };
        const upToFill = bars.filter((bar) => Date.parse(bar.t) < trade.openedAt.getTime());
        const [all, cut] = [withBars(trade, bars), withBars(trade, upToFill)];
        expect(all.setups).toEqual(cut.setups);
        expect(all.levels).toEqual(cut.levels);
      }
    });

    it('has no four-touch break when the line broke against the trade', () => {
      const { setups } = withBars({ ...putAt956, optionType: 'call' }, asMinutes(breakout));
      expect(setups.fourTouch).toBeNull();
      expect(setups.detected.filter((s) => s.detector === 'four_touch')).toEqual([]);
    });

    it('leaves the setups and levels out when the underlying’s minute bars could not be fetched', () => {
      const context = buildContext({ trade: putAt956, now: putAt956.openedAt, ...raw, minuteBars: null });
      expect(context.setups).toBeNull();
      expect(context.levels).toBeNull();
    });
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
