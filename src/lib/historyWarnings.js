import { rMultiple } from './tradeMetrics';

// A warning needs enough similar trades to mean something, a result bad
// enough to be worth interrupting for, and recent history: a habit fixed
// long ago shouldn't keep warning.
const MIN_TRADES = 5;
const WARN_AT_R = -0.3;
const RECENT_TRADES = 20;

const nyTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Which part of the regular New York session a moment falls in: the first 30
// minutes ('open'), the last 30 ('close'), 'midday' between, or null outside
// 9:30 AM to 4:00 PM.
export function sessionPart(date) {
  const parts = Object.fromEntries(nyTime.formatToParts(date).map(({ type, value }) => [type, value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (minutes < 9 * 60 + 30 || minutes >= 16 * 60) return null;
  if (minutes < 10 * 60) return 'open';
  if (minutes >= 15 * 60 + 30) return 'close';
  return 'midday';
}

const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const DAY_MS = 24 * 60 * 60 * 1000;

// Calendar days from `at` (as a New York date) to an option's expiration
// ('YYYY-MM-DD'): 0 on expiration day.
export function daysToExpiration(expiration, at) {
  return Math.round((Date.parse(expiration) - Date.parse(nyDate.format(at))) / DAY_MS);
}

// 0DTE, the rest of the week, or later: how options traders tend to group them.
function dteBucket(expiration, at) {
  if (!expiration) return null;
  const days = daysToExpiration(expiration, at);
  if (days < 0) return null;
  if (days === 0) return '0dte';
  return days <= 7 ? 'week' : 'later';
}

// The average R of the most recent closed trades matching `matches`, if
// there are enough of them and it's bad enough to warn about.
function check(trades, matches) {
  const rs = trades
    .filter(matches)
    .slice(0, RECENT_TRADES)
    .map(rMultiple)
    .filter((r) => r !== null);
  if (rs.length < MIN_TRADES) return null;

  const averageR = rs.reduce((sum, r) => sum + r, 0) / rs.length;
  if (averageR > WARN_AT_R) return null;
  // Rounded for display; float noise like -0.4000000000000001 is not news.
  return { trades: rs.length, averageR: Math.round(averageR * 100) / 100 };
}

// Warnings for a plan from the trader's own closed trades: the same symbol,
// the same direction and asset class, entries at the same time of day as
// `now`, and for an option, the same days to expiration (alone and at this
// time of day). Each is { rule, ...what matched, trades, averageR }, worst
// first.
export function historyWarnings(plan, closedTrades, { now = new Date() } = {}) {
  const trades = [...closedTrades].sort((a, b) => b.closedAt - a.closedAt);
  const warnings = [];

  if (plan.symbol) {
    const symbol = plan.symbol.toUpperCase();
    const found = check(trades, (t) => t.symbol === symbol);
    if (found) warnings.push({ rule: 'symbol', symbol, ...found });
  }

  const side = check(trades, (t) => t.direction === plan.direction && t.assetClass === plan.assetClass);
  if (side) warnings.push({ rule: 'side', direction: plan.direction, assetClass: plan.assetClass, ...side });

  const part = sessionPart(now);
  if (part) {
    const found = check(trades, (t) => sessionPart(t.openedAt) === part);
    if (found) warnings.push({ rule: 'session', sessionPart: part, ...found });
  }

  const dte = plan.assetClass === 'option' ? dteBucket(plan.expiration, now) : null;
  if (dte) {
    const sameDte = (t) => t.assetClass === 'option' && dteBucket(t.expiration, t.openedAt) === dte;
    const found = check(trades, sameDte);
    if (found) warnings.push({ rule: 'dte', dte, ...found });

    if (part) {
      const atThisTime = check(trades, (t) => sameDte(t) && sessionPart(t.openedAt) === part);
      if (atThisTime) warnings.push({ rule: 'dteSession', dte, sessionPart: part, ...atThisTime });
    }
  }

  return warnings.sort((a, b) => a.averageR - b.averageR);
}
