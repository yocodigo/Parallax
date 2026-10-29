import { formatProfitLoss } from './format';
import { profitLoss, rMultiple } from './tradeMetrics';

// The trading day is New York's: a trade closed at 11 PM Eastern belongs to
// that day, even though it's already tomorrow in UTC.
const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const sameNyDay = (a, b) => nyDate.format(a) === nyDate.format(b);

const isSet = (value) => value !== null && value !== undefined;

// Which of the trader's circuit breakers are tripped right now. `trades` are
// their recent trades; only those in `settings.modes` count. A null limit is
// off. Returns { tripped, today: { r, trades, optionsDollars }, losingStreak },
// where each tripped breaker says what it is and the numbers behind it.
export function circuitBreakers(settings, trades, { now = new Date() } = {}) {
  const counted = trades.filter((trade) => settings.modes.includes(trade.mode));

  const closed = counted
    .filter((trade) => trade.closedAt && rMultiple(trade) !== null)
    .sort((a, b) => b.closedAt - a.closedAt);
  const todayR = closed
    .filter((trade) => sameNyDay(trade.closedAt, now))
    .reduce((sum, trade) => sum + rMultiple(trade), 0);
  const tradesToday = counted.filter((trade) => trade.openedAt && sameNyDay(trade.openedAt, now)).length;

  // Options have no stop and so no R (domain rule), so their own daily limit
  // reads the dollar P/L directly instead. `closed` excludes them (rMultiple
  // is null without a stop), so this reads from `counted` itself.
  const todayOptionsDollars = counted
    .filter((trade) => trade.assetClass === 'option' && trade.closedAt && sameNyDay(trade.closedAt, now))
    .reduce((sum, trade) => sum + (profitLoss(trade) ?? 0), 0);

  let losingStreak = 0;
  while (losingStreak < closed.length && rMultiple(closed[losingStreak]) < 0) losingStreak += 1;

  const tripped = [];

  if (isSet(settings.maxDailyLossR) && todayR <= -settings.maxDailyLossR) {
    tripped.push({ breaker: 'dailyLoss', limitR: settings.maxDailyLossR, todayR });
  }

  if (isSet(settings.maxTradesPerDay) && tradesToday >= settings.maxTradesPerDay) {
    tripped.push({ breaker: 'tradesPerDay', limit: settings.maxTradesPerDay, today: tradesToday });
  }

  if (isSet(settings.maxDailyLossOptionsDollars) && todayOptionsDollars <= -settings.maxDailyLossOptionsDollars) {
    tripped.push({
      breaker: 'dailyLossOptionsDollars',
      limitDollars: settings.maxDailyLossOptionsDollars,
      todayDollars: todayOptionsDollars,
    });
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

  return { tripped, today: { r: todayR, trades: tradesToday, optionsDollars: todayOptionsDollars }, losingStreak };
}

export const BREAKER_LABELS = {
  dailyLoss: 'Daily loss limit',
  tradesPerDay: 'Trade limit',
  cooldown: 'Cool-down',
  dailyLossOptionsDollars: 'Options daily loss limit',
};

const nyClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
});

// One sentence for a tripped breaker, as circuitBreakers returns it.
export function describeBreaker(tripped) {
  switch (tripped.breaker) {
    case 'dailyLoss':
      return `Daily loss limit reached: ${tripped.todayR.toFixed(1)}R today against a limit of ${tripped.limitR.toFixed(1)}R.`;
    case 'tradesPerDay':
      return `Trade limit reached: ${tripped.today} of ${tripped.limit} trades today.`;
    case 'dailyLossOptionsDollars':
      return `Options daily loss limit reached: ${formatProfitLoss(tripped.todayDollars)} today against a limit of $${tripped.limitDollars.toFixed(2)}.`;
    default:
      return `Cool-down after ${tripped.losses} losses in a row, until ${nyClock.format(new Date(tripped.until))} ET.`;
  }
}
