import { MODES, bySetup, callsVsPuts, summarize, timeOfDay } from './performance';
import { profitLoss } from './tradeMetrics';

// The Performance Review's facts: the aggregate figures the coach reads
// alongside the raw trades, worked out here so it quotes them rather than
// doing the arithmetic (the way the weekly review and the coaching pass do).
// Each mode is broken down apart: modes are never pooled into one result.

const cents = (dollars) => (dollars === null ? null : Math.round(dollars * 100) / 100);

// The few figures of a `summarize` result worth sending, with the win rate as
// a percentage to one decimal. P/L is net of fees.
function compact(summary) {
  return {
    trades: summary.trades,
    wins: summary.wins,
    losses: summary.losses,
    scratches: summary.scratches,
    winRatePct: summary.winRate === null ? null : Math.round(summary.winRate * 1000) / 10,
    netPnl: summary.netPnl,
    avgNetPnl: cents(summary.netExpectancy),
  };
}

const weekdayName = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Per New York weekday of the fill, Monday first; a day with no trade has no row.
function byWeekday(trades) {
  const days = new Map(WEEKDAYS.map((day) => [day, []]));
  for (const trade of trades) {
    if (profitLoss(trade) === null || !trade.openedAt) continue;
    days.get(weekdayName.format(new Date(trade.openedAt))).push(trade);
  }
  return WEEKDAYS.filter((day) => days.get(day).length > 0).map((day) => ({
    day,
    ...compact(summarize(days.get(day))),
  }));
}

// `strategyNames` maps a strategy id to its name.
export function breakdowns(trades, strategyNames) {
  const populated = (rows) => rows.filter((row) => row.trades > 0);
  return {
    overall: compact(summarize(trades)),
    bySetup: bySetup(trades).map(({ strategyId, ...summary }) => ({
      setup: strategyId === null ? 'No strategy' : (strategyNames.get(strategyId) ?? 'Unknown strategy'),
      ...compact(summary),
    })),
    byWeekday: byWeekday(trades),
    byTimeOfDay: populated(timeOfDay(trades)).map(({ start, ...summary }) => ({ start, ...compact(summary) })),
    callsVsPuts: populated(callsVsPuts(trades)).map(({ type, ...summary }) => ({ type, ...compact(summary) })),
  };
}

// breakdowns() for each mode that has a closed trade, live then paper then backtest.
export function byMode(trades, strategyNames) {
  const modes = {};
  for (const mode of MODES) {
    const inMode = trades.filter((trade) => trade.mode === mode);
    if (inMode.some((trade) => profitLoss(trade) !== null)) modes[mode] = breakdowns(inMode, strategyNames);
  }
  return modes;
}
