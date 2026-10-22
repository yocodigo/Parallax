import { rMultiple } from './tradeMetrics';

// The trading day is New York's: a trade closed at 11 PM Eastern belongs to
// that day, even though it's already tomorrow in UTC.
const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const sameNyDay = (a, b) => nyDate.format(a) === nyDate.format(b);

const isSet = (value) => value !== null && value !== undefined;

// Which of the trader's circuit breakers are tripped right now. `trades` are
// their recent trades; only those in `settings.modes` count. A null limit is
// off. Returns { tripped, today: { r, trades }, losingStreak }, where each
// tripped breaker says what it is and the numbers behind it.
export function circuitBreakers(settings, trades, { now = new Date() } = {}) {
  const counted = trades.filter((trade) => settings.modes.includes(trade.mode));

  const closed = counted
    .filter((trade) => trade.closedAt && rMultiple(trade) !== null)
    .sort((a, b) => b.closedAt - a.closedAt);
  const todayR = closed
    .filter((trade) => sameNyDay(trade.closedAt, now))
    .reduce((sum, trade) => sum + rMultiple(trade), 0);
  const tradesToday = counted.filter((trade) => trade.openedAt && sameNyDay(trade.openedAt, now)).length;

  let losingStreak = 0;
  while (losingStreak < closed.length && rMultiple(closed[losingStreak]) < 0) losingStreak += 1;

  const tripped = [];

  if (isSet(settings.maxDailyLossR) && todayR <= -settings.maxDailyLossR) {
    tripped.push({ breaker: 'dailyLoss', limitR: settings.maxDailyLossR, todayR });
  }

  if (isSet(settings.maxTradesPerDay) && tradesToday >= settings.maxTradesPerDay) {
    tripped.push({ breaker: 'tradesPerDay', limit: settings.maxTradesPerDay, today: tradesToday });
  }

  if (isSet(settings.cooldownAfterLosses) && isSet(settings.cooldownMinutes) && losingStreak >= settings.cooldownAfterLosses) {
    const until = new Date(closed[0].closedAt.getTime() + settings.cooldownMinutes * 60_000);
    if (now < until) {
      tripped.push({
        breaker: 'cooldown',
        losses: losingStreak,
        minutes: settings.cooldownMinutes,
        until: until.toISOString(),
      });
    }
  }

  return { tripped, today: { r: todayR, trades: tradesToday }, losingStreak };
}
