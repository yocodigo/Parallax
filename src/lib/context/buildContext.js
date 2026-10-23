import { daysToExpiration, sessionPart } from '../historyWarnings';
import { gapPercent, minutesSinceOpen, relativeStrength, relativeVolume, sma, trendOf } from './indicators';
import { macroEvents } from './macroCalendar';
import { expectedMove, occSymbol, spreadPercent, yearsToExpiration } from './options';
import { vixBefore } from './vix';

// Live values (quote, IV, greeks) are only the values at entry if they were
// fetched close to it.
const LIVE_WINDOW_MS = 15 * 60 * 1000;

// What the free sources can't provide.
const UNAVAILABLE = ['sectorTrend', 'earnings', 'exDividend', 'ivRank'];

const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });

const round = (value, places = 2) => (value === null || value === undefined ? null : Number(value.toFixed(places)));

// The last price at or before the entry, from the entry day's minute bars.
function priceAt(bars, at) {
  const before = (bars ?? []).filter((bar) => new Date(bar.t) <= at);
  return before.at(-1)?.c ?? null;
}

// Where a symbol stood at entry. `daily` are the bars before the entry day,
// oldest first; `intraday` the entry day's minute bars.
function symbolContext(daily = [], intraday = [], at) {
  const closes = daily.map((bar) => bar.c);
  const price = priceAt(intraday, at);
  // The regular session's first bar: the open the gap is measured from.
  const session = intraday.filter((bar) => minutesSinceOpen(new Date(bar.t)) !== null && new Date(bar.t) <= at);
  const open = session[0]?.o ?? null;
  const previousClose = closes.at(-1) ?? null;
  const volumeSoFar = session.reduce((sum, bar) => sum + bar.v, 0);

  return {
    price,
    closes,
    trend: price === null ? null : trendOf(closes, price),
    gapPercent: open !== null && previousClose !== null ? round(gapPercent(open, previousClose)) : null,
    relativeVolume: round(relativeVolume(volumeSoFar, sma(daily.map((bar) => bar.v), 20), minutesSinceOpen(at))),
  };
}

// 20-day relative strength against SPY, in percentage points.
function strengthAgainst(stock, spy) {
  const from = stock.closes.at(-20);
  const spyFrom = spy.closes.at(-20);
  if (!from || !spyFrom || stock.price === null || spy.price === null) return null;
  return round(relativeStrength({ from, to: stock.price }, { from: spyFrom, to: spy.price }));
}

function optionContext(trade, option, price, now) {
  const live = option && now - trade.openedAt <= LIVE_WINDOW_MS;
  const years = yearsToExpiration(trade.openedAt, trade.expiration);
  return {
    contract: occSymbol(trade),
    dte: daysToExpiration(trade.expiration, trade.openedAt),
    openInterest: option?.openInterest ?? null,
    bid: live ? option.bid : null,
    ask: live ? option.ask : null,
    spreadPercent: live ? round(spreadPercent(option.bid, option.ask)) : null,
    iv: live ? option.iv : null,
    delta: live ? option.delta : null,
    expectedMove: live ? round(expectedMove(price, option.iv, years)) : null,
    liveSkipped: Boolean(option) && !live,
  };
}

// The market context of a trade at entry, built from what was fetched; a
// piece that couldn't be fetched is null rather than guessed. `daily` and
// `intraday` map symbols (SPY, QQQ, the trade's symbol or underlying) to bars,
// `vixRows` is Cboe's history or null, and `option` is { bid, ask, iv, delta,
// openInterest } or null.
export function buildContext({ trade, now, daily, intraday, vixRows, option }) {
  const at = trade.openedAt;
  const spy = symbolContext(daily.SPY, intraday.SPY, at);
  const qqq = symbolContext(daily.QQQ, intraday.QQQ, at);
  const stock = symbolContext(daily[trade.symbol], intraday[trade.symbol], at);
  const entryDate = nyDate.format(at);

  return {
    version: 1,
    capturedAt: now.toISOString(),
    timeOfDay: { sessionPart: sessionPart(at), minutesSinceOpen: minutesSinceOpen(at) },
    market: {
      spyTrend: spy.trend,
      qqqTrend: qqq.trend,
      vix: vixRows ? vixBefore(vixRows, entryDate) : null,
      events: macroEvents(entryDate),
    },
    stock: {
      symbol: trade.symbol,
      price: stock.price,
      trend: stock.trend,
      gapPercent: stock.gapPercent,
      relativeVolume: stock.relativeVolume,
      relativeStrength: strengthAgainst(stock, spy),
    },
    option: trade.assetClass === 'option' ? optionContext(trade, option, stock.price, now) : null,
    unavailable: UNAVAILABLE,
  };
}
