// [rules-v3 8.11] Plans not taken: a recorded option plan that was never
// filled, replayed on its New York day from the time it was written, to see what
// it would have done. Pure: the caller fetches the contract's minute bars and
// the underlying's (Alpaca's keys, oldest first; only the regular session is
// read) and the plan's working fib 50%.
//
// The entry is the planned premium, on the first contract bar after the plan was
// written that traded at it (its low to its high), or, with no planned entry, the
// open of the first bar after it. Then the first of these exits in time wins, in
// this order within a minute:
// - 'invalidation': the underlying's 1m close beyond the plan's stop on the
//   underlying (below it for a call, above it for a put), if the plan has one;
// - 'backstop': a bar trading down to the entry less `backstopPct`, sold there;
// - 't1': the underlying reaching the working fib's 50%, if that was ahead of the
//   underlying's close in the entry minute;
// - 'time_stop': `timeStopMinutes` after the entry;
// - 'session_close': the last regular-session minute either set of bars has.
// A rule that is off is left out. Every exit but the backstop sells at the close
// of the last contract bar at or before its minute: a contract has bars only for
// minutes it traded, so that can be an earlier minute's. Exits are read from the
// minute after the entry's, never the entry's own bar. The reversal exit isn't
// built yet and is left out.

import { atMost } from './setups/compare';
import { sessionBars } from './setups/session';
import { summarize } from './performance';

const MINUTE = 60_000;
// The order the exits win a tie in.
const ORDER = ['invalidation', 'backstop', 't1', 'time_stop', 'session_close'];

const startOf = (bar) => Date.parse(bar.t);

// The last bar at or before `time` (ms), or undefined.
function lastAtOrBefore(bars, time) {
  let found;
  for (const bar of bars) {
    if (startOf(bar) > time) break;
    found = bar;
  }
  return found;
}

// { outcome: 'never_triggered' }, or { outcome: 'replayed', entryAt, entryPrice,
// exitAt, exitPrice, exitReason, barCoverage }: Dates for the times, and
// barCoverage the share of the minutes after the entry up to the exit that had a
// contract bar of their own.
export function replayPlan({ plan, contractBars, underlyingBars, rules, fib50 }) {
  const call = plan.optionType === 'call';
  // The first whole minute after the plan was written: a bar starting then or later.
  const from = (Math.floor(plan.writtenAt.getTime() / MINUTE) + 1) * MINUTE;
  const contractAll = sessionBars(contractBars);
  const underlying = sessionBars(underlyingBars);

  const entryBar =
    plan.plannedEntry === null
      ? contractAll.find((bar) => startOf(bar) >= from)
      : contractAll.find((bar) => startOf(bar) >= from && bar.l <= plan.plannedEntry && plan.plannedEntry <= bar.h);
  if (!entryBar) return { outcome: 'never_triggered' };
  const entryTime = startOf(entryBar);
  const entryPrice = plan.plannedEntry ?? entryBar.o;

  const after = (bars) => bars.filter((bar) => startOf(bar) > entryTime);
  const contractAfter = after(contractAll);
  const underlyingAfter = after(underlying);
  // What the contract is worth in the minute at `time`.
  const closeAt = (time) => lastAtOrBefore(contractAll, time).c;

  const exits = [];
  const add = (reason, time, price) => exits.push({ reason, time, price });

  if (plan.underlyingStop !== null) {
    const bar = underlyingAfter.find((b) => (call ? b.c < plan.underlyingStop : b.c > plan.underlyingStop));
    if (bar) add('invalidation', startOf(bar), closeAt(startOf(bar)));
  }
  if (rules.backstopOn) {
    const level = entryPrice * (1 - rules.backstopPct);
    const bar = contractAfter.find((b) => atMost(b.l, level));
    if (bar) add('backstop', startOf(bar), level);
  }
  if (fib50 !== null) {
    const atEntry = lastAtOrBefore(underlying, entryTime);
    // T1 counts only when it is on the winning side of where the underlying was at the fill.
    if (atEntry && (call ? fib50 > atEntry.c : fib50 < atEntry.c)) {
      const bar = underlyingAfter.find((b) => (call ? b.h >= fib50 : b.l <= fib50));
      if (bar) add('t1', startOf(bar), closeAt(startOf(bar)));
    }
  }
  const sessionEnd = Math.max(...[...contractAll, ...underlying].map(startOf));
  if (rules.timeStopOn) {
    const time = entryTime + rules.timeStopMinutes * MINUTE;
    if (time <= sessionEnd) add('time_stop', time, closeAt(time));
  }
  add('session_close', sessionEnd, closeAt(sessionEnd));

  const exit = exits.sort((a, b) => a.time - b.time || ORDER.indexOf(a.reason) - ORDER.indexOf(b.reason))[0];
  const minutes = Math.round((exit.time - entryTime) / MINUTE);
  const ownBars = contractAfter.filter((bar) => startOf(bar) <= exit.time).length;
  return {
    outcome: 'replayed',
    entryAt: new Date(entryTime),
    entryPrice,
    exitAt: new Date(exit.time),
    exitPrice: exit.price,
    exitReason: exit.reason,
    barCoverage: minutes > 0 ? Math.min(ownBars / minutes, 1) : 1,
  };
}

// The replays in words and dollars: the plans, how many never triggered, and, for
// those replayed (each row carrying its `quantity` and `multiplier`, as the server
// adds them), summarize() on them as trades of the planned size with `fees` taken
// off each (an estimate: the median fees of the trades taken). Also how many
// ended on each exit, and how many were held on contract bars for every minute.
export function plansNotTakenSummary(rows, { fees }) {
  const replayed = rows.filter((row) => row.outcome === 'replayed');
  const trades = replayed.map((row) => ({
    direction: 'long',
    quantity: row.quantity,
    multiplier: row.multiplier,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    fees,
    openedAt: row.entryAt,
    closedAt: row.exitAt,
  }));
  const exits = {};
  for (const row of replayed) exits[row.exitReason] = (exits[row.exitReason] ?? 0) + 1;
  return {
    plans: rows.length,
    neverTriggered: rows.length - replayed.length,
    replayed: replayed.length,
    summary: summarize(trades),
    exits,
    fullCoverage: replayed.filter((row) => row.barCoverage === 1).length,
  };
}
