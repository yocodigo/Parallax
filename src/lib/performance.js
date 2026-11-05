import { minutesOfDay } from './setups/gates';
import { profitLoss, rMultiple, tradeStatus } from './tradeMetrics';

// Performance metrics over closed trades (docs/private/dashboard.md section 1).
// Wins, losses, and scratches are judged on gross P/L: fees would make almost
// no trade an exact scratch. Net figures subtract every fee.
//
// Money is summed in whole cents, so a round trip at the same premium is a
// scratch and totals match the broker's to the cent despite floating-point
// error in decimal prices.

const toCents = (dollars) => Math.round(dollars * 100);
const ratio = (a, b) => (b ? a / b : null);

// Closed with both prices, so it has a P/L to count.
const isCounted = (trade) => tradeStatus(trade) === 'closed' && profitLoss(trade) !== null;

function closedInCents(trades) {
  return trades
    .filter(isCounted)
    .map((trade) => {
      // profitLoss is net of fees; adding them back gives the gross P/L.
      const fees = trade.fees ?? 0;
      return { trade, gross: toCents(profitLoss(trade) + fees), fees: toCents(fees) };
    });
}

export function summarize(trades) {
  const rows = closedInCents(trades);
  const count = rows.length;
  const wins = rows.filter((r) => r.gross > 0);
  const losses = rows.filter((r) => r.gross < 0);
  const sum = (list, key) => list.reduce((total, r) => total + r[key], 0);

  // Losses stay negative, so -lossTotal and -avgLoss are their absolute values.
  const winTotal = sum(wins, 'gross');
  const lossTotal = sum(losses, 'gross');
  const gross = sum(rows, 'gross');
  const fees = sum(rows, 'fees');
  const avgWin = ratio(winTotal, wins.length);
  const avgLoss = ratio(lossTotal, losses.length);

  return {
    trades: count,
    wins: wins.length,
    losses: losses.length,
    scratches: count - wins.length - losses.length,
    winRate: ratio(wins.length, count),
    lossRate: ratio(losses.length, count),
    grossPnl: gross / 100,
    fees: fees / 100,
    netPnl: (gross - fees) / 100,
    avgWin: avgWin === null ? null : avgWin / 100,
    avgLoss: avgLoss === null ? null : avgLoss / 100,
    // Dollars won per dollar lost on average. Not an R-multiple, which is measured from a stop.
    payoffRatio: avgWin === null || avgLoss === null ? null : avgWin / -avgLoss,
    breakevenWinRate: avgWin === null || avgLoss === null ? null : -avgLoss / (avgWin - avgLoss),
    profitFactor: ratio(winTotal, -lossTotal),
    netProfitFactor: ratio(winTotal, fees - lossTotal),
    expectancy: count ? gross / count / 100 : null,
    netExpectancy: count ? (gross - fees) / count / 100 : null,
  };
}

// Cumulative net P/L after each closed trade, in closing order, and how far it
// sits below its running peak. The peak starts at zero, so early losses count.
export function equityCurve(trades) {
  // Dates from the database or ISO strings from JSON both sort by time.
  const time = (row) => new Date(row.trade.closedAt).getTime();
  const rows = closedInCents(trades).sort((a, b) => time(a) - time(b));
  let cumulative = 0;
  let peak = 0;
  return rows.map(({ trade, gross, fees }) => {
    cumulative += gross - fees;
    peak = Math.max(peak, cumulative);
    return { closedAt: trade.closedAt, cumulative: cumulative / 100, drawdown: (peak - cumulative) / 100 };
  });
}

// Expectancy per trade over the last `size` closed trades, after each close.
// Monthly samples are too small to read, so this is the trend line. Nothing
// is returned until `size` trades have closed: a shorter window would swing.
export function rollingExpectancy(trades, size = 20) {
  const time = (row) => new Date(row.trade.closedAt).getTime();
  const rows = closedInCents(trades).sort((a, b) => time(a) - time(b));
  const points = [];
  let gross = 0;
  let net = 0;
  rows.forEach(({ trade, gross: g, fees }, i) => {
    gross += g;
    net += g - fees;
    if (i >= size) {
      const old = rows[i - size];
      gross -= old.gross;
      net -= old.gross - old.fees;
    }
    if (i >= size - 1) {
      points.push({ closedAt: trade.closedAt, expectancy: gross / size / 100, netExpectancy: net / size / 100 });
    }
  });
  return points;
}

// 'YYYY-MM' of a moment in New York, where the trading day is.
const nyMonth = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
});

// summarize() per New York month of closing, oldest month first.
export function monthlySummary(trades) {
  const byMonth = new Map();
  for (const trade of trades) {
    if (!isCounted(trade)) continue;
    const month = nyMonth.format(new Date(trade.closedAt));
    byMonth.set(month, [...(byMonth.get(month) ?? []), trade]);
  }
  return [...byMonth.keys()].sort().map((month) => ({ month, ...summarize(byMonth.get(month)) }));
}

// The regular session in New York minutes of the day, split into half hours.
const SESSION_OPEN = 9 * 60 + 30;
const SESSION_CLOSE = 16 * 60;
const BUCKET_MINUTES = 30;

const clock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// summarize() per half hour of the session the trade was entered in (New York
// time, the clock the lockout windows use), earliest first. Every bucket from
// 9:30 to 15:30 is returned, empty or not, so the axis keeps its shape. Entries
// before the open or from the close on go in a last 'outside' bucket, present
// only when there are some, so the buckets still add up to the total.
export function timeOfDay(trades) {
  const count = (SESSION_CLOSE - SESSION_OPEN) / BUCKET_MINUTES;
  const buckets = Array.from({ length: count }, () => []);
  const outside = [];
  for (const trade of trades) {
    if (!isCounted(trade) || !trade.openedAt) continue;
    const minutes = minutesOfDay(new Date(trade.openedAt));
    if (minutes < SESSION_OPEN || minutes >= SESSION_CLOSE) outside.push(trade);
    else buckets[Math.floor((minutes - SESSION_OPEN) / BUCKET_MINUTES)].push(trade);
  }
  const rows = buckets.map((list, i) => ({
    start: clock(SESSION_OPEN + i * BUCKET_MINUTES),
    ...summarize(list),
  }));
  return outside.length ? [...rows, { start: 'outside', ...summarize(outside) }] : rows;
}

// summarize() for calls and for puts (dashboard.md section 4, chart 4), calls
// first. Both rows are always there, a side with no trades having null figures,
// so the chart keeps its two slots. Stocks and crypto have no option type and
// are left out.
export function callsVsPuts(trades) {
  return ['call', 'put'].map((type) => ({
    type,
    ...summarize(trades.filter((trade) => trade.optionType === type)),
  }));
}

// summarize() per underlying symbol (dashboard.md section 4, chart 4), the best
// net P/L first and ties by symbol, so the order is stable. A symbol with no
// closed trade has no row.
export function byUnderlying(trades) {
  const bySymbol = new Map();
  for (const trade of trades) {
    if (!isCounted(trade)) continue;
    bySymbol.set(trade.symbol, [...(bySymbol.get(trade.symbol) ?? []), trade]);
  }
  return [...bySymbol]
    .map(([symbol, list]) => ({ symbol, ...summarize(list) }))
    .sort((a, b) => b.netPnl - a.netPnl || a.symbol.localeCompare(b.symbol));
}

// summarize() per setup, that is per strategy (dashboard.md section 4, chart 7),
// the best net P/L first and ties by id, so the order is stable. The trades
// taken with no strategy (strategyId null) are the last row, as in graduation(),
// whatever they made. A setup with no closed trade has no row.
export function bySetup(trades) {
  const byId = new Map();
  for (const trade of trades) {
    if (!isCounted(trade)) continue;
    const id = trade.strategyId ?? null;
    byId.set(id, [...(byId.get(id) ?? []), trade]);
  }
  const rows = [...byId].map(([strategyId, list]) => ({ strategyId, ...summarize(list) }));
  const named = rows
    .filter((r) => r.strategyId !== null)
    .sort((a, b) => b.netPnl - a.netPnl || a.strategyId.localeCompare(b.strategyId));
  return [...named, ...rows.filter((r) => r.strategyId === null)];
}

// How wide a bin of the R-multiple distribution is, in R.
export const R_BIN = 1;

// The closed trades' R-multiples in bins R_BIN wide (dashboard.md section 4,
// chart 9), net of fees as rMultiple() is. A trade on an edge goes in the bin
// above it. Bins run unbroken from the lowest to the highest, empty ones
// included. Only trades with an initial stop have an R: `measured` of the
// `total` closed trades, since options without a stop would otherwise vanish
// without a word.
export function rDistribution(trades) {
  const counted = trades.filter(isCounted);
  const rs = counted.map(rMultiple).filter((r) => r !== null);
  if (rs.length === 0) return { bins: [], measured: 0, total: counted.length };
  // Rounded first (nine places, far finer than any R worth telling apart), so
  // 2.9999999999999956 is 3R and not the bin below.
  const index = (r) => Math.floor(Number(r.toFixed(9)) / R_BIN);
  const indexes = rs.map(index);
  const first = Math.min(...indexes);
  const last = Math.max(...indexes);
  const bins = Array.from({ length: last - first + 1 }, (_, i) => ({
    from: (first + i) * R_BIN,
    to: (first + i + 1) * R_BIN,
    count: indexes.filter((n) => n === first + i).length,
  }));
  return { bins, measured: rs.length, total: counted.length };
}

export const MODES = ['live', 'paper', 'backtest'];

// summarize() per mode (dashboard.md section 4, chart 11). The modes are
// separate tracks that are never blended: paper and backtest skip spread,
// slippage, and emotion, so folding them into live would flatter it. A mode
// with no closed trades is still there, with null figures. A trade in any
// other mode is left out.
export function modeComparison(trades) {
  return Object.fromEntries(MODES.map((mode) => [mode, summarize(trades.filter((t) => t.mode === mode))]));
}

// Trades in a graduation window: a setup moves up a mode once its last GRAD_N
// closed trades there average above zero (dashboard.md section 8). A default
// the spec marks (confirm); small samples mislead, so treat it as a hint.
export const GRAD_N = 30;

// One mode's cell for a setup: the count of all its closed trades, then the
// last GRAD_N of them (the window) and their net expectancy. Met needs a full
// window and net expectancy above zero, so exactly zero is not enough.
function gateCell(closed) {
  const window = closed.slice(-GRAD_N);
  const { netExpectancy } = summarize(window);
  return {
    trades: closed.length,
    window: window.length,
    netExpectancy,
    met: window.length === GRAD_N && netExpectancy > 0,
  };
}

// Progress through the promotion gates for each setup (a strategy; trades
// with none are the last row, strategyId null), dashboard.md section 4 chart
// 12. Each setup has a cell per mode, and the gap between live and paper net
// expectancy over their windows: how much execution and emotion cost against
// the idealized version. The gap is null until both windows are full: a few trades
// in either mode say little, and the gap would overstate what they show.
// Backtest cells gate the move to paper, paper to live, live to a bigger size.
export function graduation(trades) {
  const bySetup = new Map();
  for (const trade of trades) {
    if (!isCounted(trade)) continue;
    const id = trade.strategyId ?? null;
    bySetup.set(id, [...(bySetup.get(id) ?? []), trade]);
  }

  const time = (trade) => new Date(trade.closedAt).getTime();
  const rows = [...bySetup].map(([strategyId, list]) => {
    const modes = Object.fromEntries(
      MODES.map((mode) => [mode, gateCell(list.filter((t) => t.mode === mode).sort((a, b) => time(a) - time(b)))])
    );
    const { live, paper } = modes;
    const gap = live.window === GRAD_N && paper.window === GRAD_N ? live.netExpectancy - paper.netExpectancy : null;
    return { strategyId, modes, gap, total: list.length };
  });

  // The most traded setups first, trades without a setup last.
  rows.sort((a, b) => (a.strategyId === null) - (b.strategyId === null) || b.total - a.total);
  return rows.map(({ total, ...row }) => row);
}
