// [rules-v3 8.10] Level reactions over a year of one symbol's sessions.
// Server-only: it reads Alpaca's bars and the daily plans.

import { listDailyPlansBetween } from '@/db/dailyPlans';
import { levelReactions } from '@/lib/setups/levelReactions';
import { nyDay, tradingDay } from '@/lib/setups/session';
import { fetchDailyBarsBetween, LOOKBACK_DAYS, shift } from './dailyBars';
import { fetchMinuteBarsBetween } from './minuteBars';

const DAY_MS = 24 * 60 * 60 * 1000;
// Days of minute bars before January 1, so the year's first session has one before it for the
// ATR, across a weekend or a holiday.
const WARM_UP_DAYS = 5;

// { symbol, year, sessions, kinds } from levelReactions, for the regular sessions of `symbol`
// in the New York `year` that have finished, so today's still-forming one is left out. The
// minute bars come in the pages Alpaca sends them in, a year of them being tens of thousands.
export async function gatherLevelReactions(db, { symbol, year, now = new Date() }) {
  const firstDay = `${year}-01-01`;
  const lastDay = `${year}-12-31`;
  const today = nyDay(now);
  if (today <= firstDay) return { symbol, year, sessions: 0, kinds: [] };

  // January 1 is always on standard time (UTC-5), so New York midnight is 05:00 UTC.
  const start = new Date(new Date(`${firstDay}T05:00:00Z`).getTime() - WARM_UP_DAYS * DAY_MS);
  const end = new Date(Math.min(new Date(`${year + 1}-01-01T05:00:00Z`).getTime(), now.getTime()));
  const yesterday = shift(today, -1);

  const [minuteBars, dailyBars, plans] = await Promise.all([
    fetchMinuteBarsBetween(symbol, start, end),
    fetchDailyBarsBetween(symbol, shift(firstDay, -LOOKBACK_DAYS), yesterday < lastDay ? yesterday : lastDay),
    listDailyPlansBetween(db, { fromDay: firstDay, toDay: lastDay }),
  ]);

  const result = levelReactions({
    bars: minuteBars.filter((bar) => tradingDay(bar) < today),
    dailyBars,
    plans: plans.filter((plan) => plan.symbol === symbol),
    from: firstDay,
  });
  return { symbol, year, ...result };
}
