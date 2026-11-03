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
