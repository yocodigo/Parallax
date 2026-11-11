import { adherence, exitGate, planGate, stopHeldGate } from './adherence';
import { MODES, bySetup, callsVsPuts, summarize, timeOfDay } from './performance';
import { MISSED, sizeGate, windowGate } from './setups/gates';
import { nyDay } from './setups/session';
import { profitLoss, rMultiple } from './tradeMetrics';

// The Performance Review's facts: the aggregate figures the coach reads
// alongside the raw trades, worked out here so it quotes them rather than
// doing the arithmetic (the way the weekly review and the coaching pass do).
// Each mode is broken down apart: modes are never pooled into one result.

// Dollars rounded to the nearest cent.
const roundToCents = (dollars) => (dollars === null ? null : Math.round(dollars * 100) / 100);
const roundR = (r) => (r === null ? null : Math.round(r * 100) / 100);

// What a trade's setup is called: its strategy's name, 'No strategy' when it
// had none, 'Unknown strategy' when the strategy has since been deleted.
const setupName = (strategyId, strategyNames) =>
  strategyId ? (strategyNames.get(strategyId) ?? 'Unknown strategy') : 'No strategy';

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
      setup: setupName(strategyId, strategyNames),
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
  // getUTCDay() counts Sunday as 0; this is days since Monday, Monday being 0.
  const [year, month, date] = day.split('-').map(Number);
  const monday = new Date(Date.UTC(year, month - 1, date));
  monday.setUTCDate(date - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

// A group of trades (with their tags) as results plus how many mistakes they
// carried per reviewed trade (a trade never reviewed says nothing about
// mistakes, so it is left out of the rate and `reviewedTrades` says how many
// there were; null when none was) and the average emotional control rated.
function trendRow(rows) {
  const reviewed = rows.filter((row) => row.reviewed);
  const mistakeCount = reviewed.reduce((total, row) => total + row.mistakes.size, 0);
  return {
    ...compact(summarize(rows.map(({ trade }) => trade))),
    reviewedTrades: reviewed.length,
    mistakesPerTrade: reviewed.length ? Math.round((mistakeCount / reviewed.length) * 100) / 100 : null,
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
// `entries` are journal entries with a `tradeId`; `trades` need an `id`, and
// should all be of one mode, since modes are never pooled.
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
    // The run of trading days in a row with the mistake, pushed once it ends.
    let start = null;
    for (let i = 0; i <= days.length; i += 1) {
      const tagged = i < days.length && mistakesByDay.get(days[i]).has(mistake);
      if (tagged && start === null) start = i;
      if (!tagged && start !== null) {
        if (i - start >= 2) runs.push({ mistake, days: i - start, from: days[start], to: days[i - 1] });
        start = null;
      }
    }
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

// Most flagged trades listed, newest first; `omitted` says how many more.
export const MAX_FLAGGED = 20;

// Fewest closed trades a setup or condition needs to be called "working".
export const WORKING_MIN_TRADES = 5;

// The checks adherence() makes (adherence.js); keep the two in step.
const CHECKS = [
  ['Window', (trade) => windowGate(trade.openedAt && new Date(trade.openedAt))],
  ['Size', (trade) => sizeGate(trade.quantity)],
  ['Plan', planGate],
  ['Stop', stopHeldGate],
  ['Exit', exitGate],
];

// Rule adherence over closed option trades (as the dashboard's table counts
// it): `checks` is adherence()'s figures, and `flagged` the trades that missed
// at least one check with the ones missed, newest first (at most MAX_FLAGGED).
// The trades need `planWrittenAt` and `unmetRuleCount` (listPlanFacts).
export function ruleAdherence(trades) {
  const flagged = trades
    .filter((trade) => trade.assetClass === 'option' && profitLoss(trade) !== null && trade.openedAt)
    .map((trade) => ({
      date: nyDay(new Date(trade.openedAt)),
      symbol: trade.symbol,
      optionType: trade.optionType,
      quantity: trade.quantity,
      netPnl: roundToCents(profitLoss(trade)),
      failed: CHECKS.filter(([, check]) => check(trade) === MISSED).map(([name]) => name),
      openedAt: new Date(trade.openedAt),
    }))
    .filter((trade) => trade.failed.length > 0)
    .sort((a, b) => b.openedAt - a.openedAt);
  return {
    checks: adherence(trades),
    // `openedAt` was only there to sort by.
    flagged: flagged.slice(0, MAX_FLAGGED).map(({ openedAt, ...rest }) => rest),
    flaggedTrades: flagged.length,
    omitted: Math.max(0, flagged.length - MAX_FLAGGED),
  };
}

const percent = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

// The setups, New York weekdays, and calls or puts with at least
// WORKING_MIN_TRADES closed trades and a profit, best first, each with how
// well the trades in it were executed: the share of Plan, Stop, and Exit checks
// passed (`disciplinePct`, null when none applied) and the share of reviewed
// trades with no mistake tagged (`cleanReviewPct`, null when none was
// reviewed). `trades` need the plan facts of ruleAdherence; `entries` are
// journal entries with a `tradeId`. (One pass over the three kinds rather than
// the breakdowns above, since each group also needs its discipline and
// clean-review shares.)
export function workingGroups(trades, entries, strategyNames) {
  const counted = trades.filter((trade) => profitLoss(trade) !== null);
  const kinds = [
    ['setup', (trade) => setupName(trade.strategyId, strategyNames)],
    ['weekday', (trade) => (trade.openedAt ? weekdayName.format(new Date(trade.openedAt)) : null)],
    ['call or put', (trade) => trade.optionType ?? null],
  ];

  const rows = [];
  for (const [kind, nameOf] of kinds) {
    const groups = new Map();
    for (const trade of counted) {
      const name = nameOf(trade);
      if (name === null) continue;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(trade);
    }
    for (const [name, list] of groups) {
      const summary = summarize(list);
      if (list.length < WORKING_MIN_TRADES || summary.netPnl <= 0) continue;
      const { discipline } = adherence(list);
      const reviewed = list
        .map((trade) => tagsOf(entries.filter((entry) => entry.tradeId === trade.id)))
        .filter((tags) => tags.reviewed);
      rows.push({
        kind,
        name,
        ...compact(summary),
        disciplinePct: percent(discipline.ok, discipline.ok + discipline.missed),
        cleanReviewPct: percent(reviewed.filter((tags) => tags.mistakes.size === 0).length, reviewed.length),
      });
    }
  }
  return rows.sort((a, b) => b.netPnl - a.netPnl);
}

// Most of the newest trades and journal entries listed raw, and the longest a
// note is kept: the figures in `modes` always cover every trade, the lists only
// give the coach dates and examples to quote.
export const MAX_TRADES = 300;
export const MAX_ENTRIES = 300;
export const MAX_NOTE = 1500;

const nyClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// "2026-04-13 10:00", in New York time.
function nyDateTime(date) {
  const parts = Object.fromEntries(nyClock.formatToParts(new Date(date)).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

// A day's fib for one timeframe, null when the day has none for it.
const fibOf = (direction, fib50, fib100) => (direction ? { direction, fib50, fib100 } : null);

// Everything the Performance Review's coach reads, as one object (reviewCoach.js
// describes it): `modes` has the figures for each mode apart; the rest is raw
// material to quote.
// - `trades`: closed trades in range, each with the plan facts of ruleAdherence;
// - `entries`: journal entries with a `tradeId` or none, already limited to the
//   range by the caller; those of a trade not listed are left out;
// - `dailyPlans`: rows of the daily_plans table; `strategies` with their rules;
// - `range`: { label, from, to }, passed through.
export function buildReviewFacts({ trades, entries, dailyPlans, strategies, range }) {
  const strategyNames = new Map(strategies.map(({ id, name }) => [id, name]));

  const modes = {};
  for (const [mode, inMode] of Object.entries(byMode(trades, strategyNames))) {
    const ofMode = trades.filter((trade) => trade.mode === mode);
    modes[mode] = {
      ...inMode,
      outcomes: outcomesByTag(ofMode, entries),
      trend: trendFacts(ofMode, entries),
      adherence: ruleAdherence(ofMode),
      working: workingGroups(ofMode, entries, strategyNames),
    };
  }

  const closed = trades
    .filter((trade) => profitLoss(trade) !== null && trade.openedAt)
    .sort((a, b) => new Date(a.openedAt) - new Date(b.openedAt));
  const kept = closed.slice(-MAX_TRADES);
  const refs = new Map(kept.map((trade, i) => [trade.id, i + 1]));
  
  const listed = entries
    .filter((entry) => !entry.tradeId || refs.has(entry.tradeId))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const keptEntries = listed.slice(-MAX_ENTRIES);

  const days = new Set(kept.map((trade) => nyDay(new Date(trade.openedAt))));

  return {
    range,
    modes,
    trades: kept.map((trade) => ({
      ref: refs.get(trade.id),
      mode: trade.mode,
      symbol: trade.symbol,
      assetClass: trade.assetClass,
      direction: trade.direction,
      optionType: trade.optionType ?? null,
      strike: trade.strike ?? null,
      expiration: trade.expiration ?? null,
      quantity: trade.quantity,
      setup: setupName(trade.strategyId, strategyNames),
      stopRule: trade.stopRule ?? null,
      plannedEntry: trade.plannedEntry ?? null,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      stop: trade.initialStop ?? null,
      target: trade.target ?? null,
      exitReason: trade.exitReason ?? null,
      filledAt: nyDateTime(trade.openedAt),
      closedAt: nyDateTime(trade.closedAt),
      netPnl: roundToCents(profitLoss(trade)),
      r: roundR(rMultiple(trade)),
    })),
    tradesOmitted: closed.length - kept.length,
    journalEntries: keptEntries.map((entry) => ({
      ref: entry.tradeId ? refs.get(entry.tradeId) : null,
      date: nyDay(new Date(entry.createdAt)),
      kind: entry.kind,
      mode: entry.mode ?? null,
      symbol: entry.symbol ?? null,
      emotion: entry.emotion ?? null,
      mistakes: entry.mistakes ?? [],
      emotionalControl: entry.emotionalControl ?? null,
      notes: entry.notes.length > MAX_NOTE ? `${entry.notes.slice(0, MAX_NOTE)}…` : entry.notes,
    })),
    // Every entry given but not listed: past the cap, or of a trade left out.
    journalEntriesOmitted: entries.length - keptEntries.length,
    dailyPlans: dailyPlans
      .filter((plan) => days.has(plan.tradeDate))
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
      .map((plan) => ({
        date: plan.tradeDate,
        lowerTimeframe: fibOf(plan.ltfDirection, plan.ltfFib50, plan.ltfFib100),
        higherTimeframe: fibOf(plan.htfDirection, plan.htfFib50, plan.htfFib100),
        notes: plan.notes ?? null,
      })),
    strategies: strategies.map(({ name, rules }) => ({ name, rules: rules.map(({ kind, text }) => ({ kind, text })) })),
  };
}
