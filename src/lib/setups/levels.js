// [rules-v3 3] The level map: the liquidity levels of a symbol as of a time,
// ranked by what each may be used for. Pure: the caller fetches the
// underlying's minute bars (several sessions, oldest first, Alpaca's keys;
// anything outside the regular session is dropped here), its daily bars, and
// the day's plan.
//
// Each level is { kind, price, tier, side, touchedToday, formedAt }:
// - tier 1 can be traded from on its own, tier 2 needs one independent
//   confirmation as well, and tier 3 only gives targets and the day's
//   picture, no entries (Joel's level ladder);
// - side is where the level sits against the last close: 'resistance' above
//   it, 'support' at or below it;
// - touchedToday is whether a regular-session minute bar of the day traded at
//   the level after it formed. One still untouched beyond price is something
//   to aim at; one traded at already has been used up;
// - formedAt is when a level found in the bars came to exist (the close of
//   the last bar that defined it), or null for one known before the open
//   (daily bars, the plan, round numbers).
//
// No lookahead: only bars that had closed by `asOf` are read, so a level
// found in the bars only appears after its last defining bar has closed.

import { minutesSinceOpen } from '@/lib/context/indicators';
import { atLeast, atMost } from './compare';
import { resample } from './resample';
import { nyDay, sessionBars, sessionOf, tradingDay } from './session';
import { OPENING_RANGE_MIN, ROUND_STEP, SWING_K } from './settings';
import { dealingRange, swings } from './swings';

const MINUTE = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const closeOf = (bar, minutes = 1) => Date.parse(bar.t) + minutes * MINUTE;

// The Monday starting the calendar week of a 'YYYY-MM-DD' date, as the same
// kind of string. Worked in UTC on the date alone, so no time zone shifts it.
function mondayOf(date) {
  const ms = Date.parse(`${date}T00:00:00Z`);
  const weekday = (new Date(ms).getUTCDay() + 6) % 7; // Monday 0 ... Sunday 6
  return new Date(ms - weekday * DAY_MS).toISOString().slice(0, 10);
}

const highLow = (bars) =>
  bars.length === 0
    ? null
    : { high: Math.max(...bars.map((bar) => bar.h)), low: Math.min(...bars.map((bar) => bar.l)) };

// Levels from the daily bars: the prior day's and the prior calendar week's
// highs and lows. The day's own daily bar is still forming and never read.
function dailyLevels(dailyBars, day) {
  const before = dailyBars.filter((bar) => tradingDay(bar) < day);
  const thisWeek = mondayOf(day);
  // The Monday of the week holding the Sunday before this week's Monday.
  const lastWeek = mondayOf(new Date(Date.parse(`${thisWeek}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10));
  const week = highLow(before.filter((bar) => tradingDay(bar) >= lastWeek && tradingDay(bar) < thisWeek));
  const prior = highLow(before.slice(-1));
  return [
    prior && { kind: 'prior_day_high', price: prior.high, tier: 1 },
    prior && { kind: 'prior_day_low', price: prior.low, tier: 1 },
    week && { kind: 'prior_week_high', price: week.high, tier: 1 },
    week && { kind: 'prior_week_low', price: week.low, tier: 1 },
  ];
}

const PLAN_LEVELS = [
  ['asiaHigh', 'asia_high', 1],
  ['asiaLow', 'asia_low', 1],
  ['londonHigh', 'london_high', 1],
  ['londonLow', 'london_low', 1],
  ['premarketHigh', 'premarket_high', 1],
  ['premarketLow', 'premarket_low', 1],
  ['ltfFib50', 'fib_50', 3],
  ['ltfFib100', 'fib_100', 3],
  ['htfFib50', 'htf_fib_50', 3],
  ['htfFib100', 'htf_fib_100', 3],
];

// The overnight levels Joel records and the day's fibs. `fib_*` is the working
// (lower-timeframe) fib, `htf_fib_*` the second one. A blank one is absent.
function planLevels(plan) {
  if (!plan) return [];
  return PLAN_LEVELS.filter(([field]) => plan[field] != null).map(([field, kind, tier]) => ({
    kind,
    price: plan[field],
    tier,
  }));
}

// The extreme bar of `bars` by `pick`, the first one on a tie.
function extremeIndex(bars, pick, better) {
  let best = 0;
  for (let k = 1; k < bars.length; k++) if (better(pick(bars[k]), pick(bars[best]))) best = k;
  return best;
}

// The session's high and low so far, each formed by its own bar, and the
// opening range once its minutes have all closed.
function sessionLevels(today, asOf) {
  const levels = [];
  const hi = extremeIndex(today, (bar) => bar.h, (a, b) => a > b);
  const lo = extremeIndex(today, (bar) => bar.l, (a, b) => a < b);
  levels.push({ kind: 'session_high', price: today[hi].h, tier: 2, formed: closeOf(today[hi]) });
  levels.push({ kind: 'session_low', price: today[lo].l, tier: 2, formed: closeOf(today[lo]) });

  // Clock time, not a bar count: the IEX feed skips quiet minutes.
  const sinceOpen = minutesSinceOpen(asOf);
  const opening = today.filter((bar) => minutesSinceOpen(new Date(bar.t)) < OPENING_RANGE_MIN);
  if (opening.length > 0 && (sinceOpen === null || sinceOpen >= OPENING_RANGE_MIN)) {
    const range = highLow(opening);
    // Formed by the range's last bar: a touch counts only after the range closed.
    const formed = closeOf(opening.at(-1));
    levels.push({ kind: 'opening_range_high', price: range.high, tier: 2, formed });
    levels.push({ kind: 'opening_range_low', price: range.low, tier: 2, formed });
  }
  return levels;
}

// The 50% of the 5m dealing range, as the gates and the entry review read it.
// It forms when the newer of its two swings is confirmed (SWING_K bars on),
// so the leg that drew the range doesn't count as touching its middle.
function rangeLevel(bars, asOf, day) {
  const bars5 = sessionOf(resample(bars, 5, { asOf }), day);
  if (bars5.length === 0) return null;
  const swingList = swings(bars5, bars5.length - 1);
  const range = dealingRange(swingList);
  if (!range) return null;
  const newest = Math.max(...['low', 'high'].map((kind) => swingList.findLast((s) => s.kind === kind).index));
  return {
    kind: 'range_50',
    price: (range.low + range.high) / 2,
    tier: 3,
    formed: closeOf(bars5[newest + SWING_K], 5),
  };
}

// The round numbers either side of `price`: one level when it sits on one.
function roundLevels(price) {
  const below = Math.floor(price / ROUND_STEP) * ROUND_STEP;
  const above = atLeast(below, price) ? below : below + ROUND_STEP;
  const prices = above === below ? [below] : [below, above];
  return prices.map((p) => ({ kind: 'round', price: p, tier: 3 }));
}

const reaches = (bar, price) => atMost(bar.l, price) && atLeast(bar.h, price);

// The level map of a symbol as of `asOf` (a Date), from its regular-session
// minute bars, daily bars, and the day's plan (null when none). Empty until a
// bar of the day has closed: with no price yet there is no side to read.
export function levelMap({ bars = [], dailyBars = [], dailyPlan = null, asOf }) {
  const day = nyDay(asOf);
  const closed = resample(sessionBars(bars), 1, { asOf });
  const today = sessionOf(closed, day);
  if (today.length === 0) return [];
  const price = today.at(-1).c;

  const found = [
    ...dailyLevels(dailyBars, day),
    ...planLevels(dailyPlan),
    ...sessionLevels(today, asOf),
    rangeLevel(closed, asOf, day),
    ...roundLevels(price),
  ].filter(Boolean);

  return found
    .map(({ formed, ...level }) => ({
      ...level,
      side: atMost(level.price, price) ? 'support' : 'resistance',
      // Bars that started once the level existed; all of the day's for one
      // known before the open.
      touchedToday: today.some((bar) => (formed === undefined || Date.parse(bar.t) >= formed) && reaches(bar, level.price)),
      formedAt: formed === undefined ? null : new Date(formed).toISOString(),
    }))
    .sort((a, b) => a.price - b.price);
}
