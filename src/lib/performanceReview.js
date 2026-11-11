import { MODES, bySetup, callsVsPuts, summarize, timeOfDay } from './performance';
import { nyDay } from './setups/session';
import { profitLoss } from './tradeMetrics';

// The Performance Review's facts: the aggregate figures the coach reads
// alongside the raw trades, worked out here so it quotes them rather than
// doing the arithmetic (the way the weekly review and the coaching pass do).
// Each mode is broken down apart: modes are never pooled into one result.

// Dollars rounded to the nearest cent.
const roundToCents = (dollars) => (dollars === null ? null : Math.round(dollars * 100) / 100);

// The few figures of a `summarize` result worth sending, with the win rate as
// a percentage to one decimal. P/L is net of fees.
function compact(summary) {
  return {
    trades: summary.trades,
    wins: summary.wins,
    losses: summary.losses,
    scratches: summary.scratches,
    // The fraction as a percentage to one decimal: 0.3333 becomes 33.3.
    winRatePct: summary.winRate === null ? null : Math.round(summary.winRate * 1000) / 10,
    netPnl: summary.netPnl,
    avgNetPnl: roundToCents(summary.netExpectancy),
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

const countOf = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const mostFrequent = (a, b) => b.trades - a.trades || a.netPnl - b.netPnl;

// Each of the trade's journal entries' tags, once per trade, with the trade's
// 1-10 emotional-control ratings (reviews only) averaged.
function tagsOf(entries) {
  const mistakes = new Set(entries.flatMap((entry) => entry.mistakes ?? []));
  const emotions = new Set(entries.map((entry) => entry.emotion).filter(Boolean));
  // Only reviews carry a rating (journalEntry.js refuses one on any other kind).
  const ratings = entries.map((entry) => entry.emotionalControl).filter(Boolean);
  return {
    mistakes,
    emotions,
    reviewed: entries.some((entry) => entry.kind === 'review'),
    control: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
  };
}

const CONTROL_BANDS = [
  { band: 'low (1-3)', max: 3 },
  { band: 'middle (4-6)', max: 6 },
  { band: 'high (7-10)', max: 10 },
];
// The mean rating is rounded to a whole number first, so 3.5 and above is in the
// middle band and 6.5 and above in the high one.
const bandOf = (control) => CONTROL_BANDS.find(({ max }) => Math.round(control) <= max).band;

// How the trader's own tags line up with results: each mistake, each emotion
// (with the mistakes that came with it), and the emotional-control rating, all
// over closed trades. A trade counts once per tag however many of its entries
// carry it. Mistakes are compared with the trades that were reviewed and had
// none tagged; trades with no review at all are counted apart, since an
// untagged trade there says nothing. `entries` are journal entries with a
// `tradeId`; `trades` need an `id`.
export function outcomesByTag(trades, entries) {
  const counted = trades.filter((trade) => profitLoss(trade) !== null);
  const tagged = counted.map((trade) => ({
    trade,
    ...tagsOf(entries.filter((entry) => entry.tradeId === trade.id)),
  }));
  const rowOf = (list) => compact(summarize(list.map(({ trade }) => trade)));

  const group = (keysOf) => {
    const groups = new Map();
    for (const row of tagged) {
      for (const key of keysOf(row)) {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
    }
    return groups;
  };

  const mistakes = [...group((row) => row.mistakes)]
    .map(([mistake, list]) => ({ mistake, ...rowOf(list) }))
    .sort(mostFrequent);

  const emotions = [...group((row) => row.emotions)]
    .map(([emotion, list]) => {
      const withMistakes = list.filter((row) => row.mistakes.size > 0);
      const counts = new Map();
      for (const row of withMistakes) for (const mistake of row.mistakes) countOf(counts, mistake);
      return {
        emotion,
        ...rowOf(list),
        tradesWithMistakes: withMistakes.length,
        mistakes: [...counts]
          .map(([mistake, trades]) => ({ mistake, trades }))
          .sort((a, b) => b.trades - a.trades || a.mistake.localeCompare(b.mistake)),
      };
    })
    .sort(mostFrequent);

  const rated = group((row) => (row.control === null ? [] : [bandOf(row.control)]));
  const emotionalControl = CONTROL_BANDS.filter(({ band }) => rated.has(band)).map(({ band }) => ({
    band,
    ...rowOf(rated.get(band)),
    tradesWithMistakes: rated.get(band).filter((row) => row.mistakes.size > 0).length,
  }));

  const clean = tagged.filter((row) => row.reviewed && row.mistakes.size === 0);
  return {
    mistakes,
    noMistakes: clean.length ? rowOf(clean) : null,
    unreviewed: tagged.filter((row) => !row.reviewed).length,
    emotions,
    emotionalControl,
  };
}

// Fewest trades for a first-half against second-half comparison to mean anything.
export const TREND_MIN_TRADES = 10;

const average = (numbers, places) => {
  if (numbers.length === 0) return null;
  const factor = 10 ** places;
  return Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * factor) / factor;
};

// The Monday of the week a 'YYYY-MM-DD' New York date falls in.
function mondayOf(day) {
  const [year, month, date] = day.split('-').map(Number);
  const monday = new Date(Date.UTC(year, month - 1, date));
  monday.setUTCDate(date - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

// A group of trades (with their tags) as results plus how many mistakes they
// carried per trade and the average emotional control they were rated.
function trendRow(rows) {
  const mistakeCount = rows.reduce((total, row) => total + row.mistakes.size, 0);
  return {
    ...compact(summarize(rows.map(({ trade }) => trade))),
    mistakesPerTrade: Math.round((mistakeCount / rows.length) * 100) / 100,
    avgControl: average(
      rows.map((row) => row.control).filter((control) => control !== null),
      1
    ),
  };
}

// Whether the trader repeats a mistake and whether they are improving, over
// closed trades, by the New York day of the fill:
// - `mistakeRuns`: a mistake tagged on two or more trading days in a row (days
//   they traded, so a weekend or a day off is no gap), each run apart, longest first;
// - `weeks`: each New York week (named by its Monday), oldest first;
// - `trend`: the first half of the trades against the second (the odd trade in
//   the first), null below TREND_MIN_TRADES.
// `entries` are journal entries with a `tradeId`; `trades` need an `id`.
export function trendFacts(trades, entries) {
  const rows = trades
    .filter((trade) => profitLoss(trade) !== null && trade.openedAt)
    .sort((a, b) => new Date(a.openedAt) - new Date(b.openedAt))
    .map((trade) => ({
      trade,
      day: nyDay(new Date(trade.openedAt)),
      ...tagsOf(entries.filter((entry) => entry.tradeId === trade.id)),
    }));

  const mistakesByDay = new Map();
  for (const row of rows) {
    const seen = mistakesByDay.get(row.day) ?? new Set();
    for (const mistake of row.mistakes) seen.add(mistake);
    mistakesByDay.set(row.day, seen);
  }
  const days = [...mistakesByDay.keys()];
  const runs = [];
  for (const mistake of new Set(rows.flatMap((row) => [...row.mistakes]))) {
    let start = null;
    days.forEach((day, i) => {
      const tagged = mistakesByDay.get(day).has(mistake);
      if (tagged && start === null) start = i;
      const ended = !tagged || i === days.length - 1;
      if (start !== null && ended) {
        const last = tagged ? i : i - 1;
        if (last > start) runs.push({ mistake, days: last - start + 1, from: days[start], to: days[last] });
        start = null;
      }
    });
  }
  runs.sort((a, b) => b.days - a.days || a.mistake.localeCompare(b.mistake) || a.from.localeCompare(b.from));

  const byWeek = new Map();
  for (const row of rows) {
    const week = mondayOf(row.day);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week).push(row);
  }

  const half = Math.ceil(rows.length / 2);
  const span = (list) => ({ from: list[0].day, to: list[list.length - 1].day, ...trendRow(list) });
  return {
    mistakeRuns: runs,
    weeks: [...byWeek].map(([week, list]) => ({ week, ...trendRow(list) })),
    trend: rows.length < TREND_MIN_TRADES ? null : { first: span(rows.slice(0, half)), second: span(rows.slice(half)) },
  };
}
