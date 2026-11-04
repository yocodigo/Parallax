import { minutesOfDay } from './setups/gates';
import { profitLoss, tradeStatus } from './tradeMetrics';

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

export const MODES = ['live', 'paper', 'backtest'];

// summarize() per mode (dashboard.md section 4, chart 11). The modes are
// separate tracks that are never blended: paper and backtest skip spread,
// slippage, and emotion, so folding them into live would flatter it. A mode
// with no closed trades is still there, with null figures. A trade in any
// other mode is left out.
export function modeComparison(trades) {
  return Object.fromEntries(MODES.map((mode) => [mode, summarize(trades.filter((t) => t.mode === mode))]));
}
