import { daysToExpiration, sessionPart } from '../historyWarnings';
import { detectSetups } from '../setups/detected';
import { fourTouchAt } from '../setups/entryReview';
import { levelMap } from '../setups/levels';
import { sessionBars } from '../setups/session';
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

const MINUTE_MS = 60 * 1000;

// A minute bar is stamped with its start, so it only predates the entry if it
// ended (start + 1 minute) by then; the bar the fill happened in already
// holds prices from after it.
const endedBy = (bar, at) => new Date(bar.t).getTime() + MINUTE_MS <= at.getTime();

const round = (value, places = 2) => (value === null || value === undefined ? null : Number(value.toFixed(places)));

// The last price before the entry, from the entry day's minute bars.
function priceAt(bars, at) {
  const before = (bars ?? []).filter((bar) => endedBy(bar, at));
  return before.at(-1)?.c ?? null;
}

// Where a symbol stood at entry. `daily` are the bars before the entry day,
// oldest first; `intraday` the entry day's minute bars.
function symbolContext(daily = [], intraday = [], at) {
  const closes = daily.map((bar) => bar.c);
  const price = priceAt(intraday, at);
  // The regular session's first bar: the open the gap is measured from.
  const session = intraday.filter((bar) => minutesSinceOpen(new Date(bar.t)) !== null && endedBy(bar, at));
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

// The level map of the underlying at the fill (rules-v3 3), from its minute
// bars, the daily bars before the day, and the day's plan; null without the
// minute bars. Kept because the plan can be edited after the entry.
export function levelsAt(trade, bars, { dailyBars = [], dailyPlan = null } = {}) {
  if (!bars?.length) return null;
  return levelMap({ bars: sessionBars(bars), dailyBars, dailyPlan, asOf: trade.openedAt });
}

// The setups the underlying's minute bars showed at entry, or null without
// them: the four-touch break the trade went with (null when none), kept for
// its quality grade, and every setup detected the trade's way (rules-v3 6).
// `levels` is the level map at the fill, where the three-gate detector looks
// for its sweeps.
export function setupsAt(trade, bars, levels = []) {
  if (!bars?.length) return null;
  return { fourTouch: fourTouchAt(trade, bars), detected: detectSetups(trade, bars, { levels: levels ?? [] }) };
}

// The market context of a trade at entry, built from what was fetched; a
// piece that couldn't be fetched is null rather than guessed. `daily` and
// `intraday` map symbols (SPY, QQQ, the trade's symbol or underlying) to bars,
// `vixRows` is Cboe's history or null, and `option` is { bid, ask, iv, delta,
// openInterest } or null. `minuteBars` are the underlying's own, reaching
// back a session for the 15m bands (null when they couldn't be fetched), and
// `dailyPlan` the day's plan row or null.
export function buildContext({ trade, now, daily, intraday, vixRows, option, minuteBars = null, dailyPlan = null }) {
  const at = trade.openedAt;
  const spy = symbolContext(daily.SPY, intraday.SPY, at);
  const qqq = symbolContext(daily.QQQ, intraday.QQQ, at);
  const stock = symbolContext(daily[trade.symbol], intraday[trade.symbol], at);
  const entryDate = nyDate.format(at);
  const levels = levelsAt(trade, minuteBars, { dailyBars: daily[trade.symbol] ?? [], dailyPlan });

  return {
    version: 3,
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
    setups: setupsAt(trade, minuteBars, levels),
    levels,
    unavailable: UNAVAILABLE,
  };
}
