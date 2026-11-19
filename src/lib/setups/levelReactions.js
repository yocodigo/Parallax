// [rules-v3 8.10] How price reacted to each level known at the open, session
// by session over a stretch of days: how often it was reached, and of those
// touches how often it rejected, ran through, oscillated, did neither, or was
// still undecided at the close. Pure: the caller fetches one symbol's minute
// bars (several sessions, oldest first, Alpaca's keys), its daily bars from
// before the first of them, and its daily plans.
//
// Only levels fixed before the open count: the prior day, week, and month
// highs and lows, and the plan's overnight levels and fibs on the days that
// symbol was planned. The side price approaches from is set by the open (a
// level above it is reached from below), only the first touch of a session is
// judged, and `reactionAt` runs to the close. The session before feeds the ATR,
// so a stretch's first session isn't judged, nor, with `from`, any session
// before that 'YYYY-MM-DD' date, which is there only to feed the ATR.

import { dailyLevels, planLevels } from './levels';
import { reactionAt } from './reaction';
import { sessionBars, tradingDay } from './session';

const DAILY_KINDS = [
  'prior_day_high',
  'prior_day_low',
  'prior_week_high',
  'prior_week_low',
  'prior_month_high',
  'prior_month_low',
];
const PLAN_KINDS = [
  'asia_high',
  'asia_low',
  'london_high',
  'london_low',
  'premarket_high',
  'premarket_low',
  'fib_50',
  'fib_100',
  'htf_fib_50',
  'htf_fib_100',
];
const KIND_ORDER = [...DAILY_KINDS, ...PLAN_KINDS];

// How reactionAt's answer is counted: its kinds by name, undecided for one still open.
const OUTCOME = { rejected: 'rejected', ripped: 'ranThrough', oscillating: 'oscillating', none: 'none', null: 'undecided' };

const emptyRow = (kind) => ({
  kind,
  sessions: 0,
  reached: 0,
  rejected: 0,
  ranThrough: 0,
  oscillating: 0,
  none: 0,
  undecided: 0,
});

// Bars grouped into regular sessions by New York day, oldest first.
function sessionsOf(bars) {
  const days = new Map();
  for (const bar of sessionBars(bars)) {
    const day = tradingDay(bar);
    days.set(day, [...(days.get(day) ?? []), bar]);
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b));
}

// { sessions, kinds }: the sessions judged, and per level kind (in the level
// map's order, a kind with no level in any session left out) the sessions it
// had a level in and what happened to each. `plans` are one symbol's daily plans.
export function levelReactions({ bars, dailyBars, plans, from = null }) {
  const planByDay = new Map(plans.map((plan) => [plan.tradeDate, plan]));
  const rows = new Map();
  const days = sessionsOf(bars);

  for (let d = 1; d < days.length; d++) {
    const [day, today] = days[d];
    if (from !== null && day < from) continue;
    const before = days[d - 1][1];
    const joined = [...before, ...today];
    const open = today[0].o;
    const levels = [...dailyLevels(dailyBars, day), ...planLevels(planByDay.get(day) ?? null)].filter(Boolean);

    for (const { kind, price } of levels) {
      // At the open exactly there is no side to approach from.
      if (price === open) continue;
      const row = rows.get(kind) ?? emptyRow(kind);
      rows.set(kind, row);
      row.sessions += 1;

      const reaction = reactionAt(joined, price, price > open ? 'long' : 'short', before.length, joined.length - 1);
      if (reaction === null) continue;
      row.reached += 1;
      row[OUTCOME[reaction.kind]] += 1;
    }
  }

  return {
    sessions: days.slice(1).filter(([day]) => from === null || day >= from).length,
    kinds: KIND_ORDER.filter((kind) => rows.has(kind)).map((kind) => rows.get(kind)),
  };
}
