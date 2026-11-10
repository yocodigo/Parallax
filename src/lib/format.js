// Display formats shared by the journal UI and the weekly review.

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  signDisplay: 'always',
});

// "+$998.00", "-$500.00".
export const formatProfitLoss = (amount) => money.format(amount);

// "<1m", "45m", "2h 15m", "1d 2h": a hold time given in minutes, to the
// precision a person reads it at. A dash when there isn't one.
export function formatHold(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 1) return '<1m';
  // Rounded first, so 59.6 minutes reads "1h" and never "60m".
  const total = Math.round(minutes);
  const [days, hours, mins] = [Math.floor(total / 1440), Math.floor((total % 1440) / 60), total % 60];
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

// "+2.0R", "-1.0R".
export const formatR = (r) => `${r > 0 ? '+' : ''}${r.toFixed(1)}R`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "500C exp Jan 16". The expiration is a 'YYYY-MM-DD' calendar date, read
// from its parts so no time zone can move it to the day before.
export function formatContract({ optionType, strike, expiration }) {
  if (!optionType || strike === null || strike === undefined || !expiration) return '';
  const [, month, day] = expiration.split('-').map(Number);
  return `${strike}${optionType === 'call' ? 'C' : 'P'} exp ${MONTHS[month - 1]} ${day}`;
}

const tradeTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
});

// "10:43 AM": when a trade was filled, in New York time. Empty for a plan
// with no fill yet.
export const formatTradeTime = (openedAt) => (openedAt ? tradeTime.format(new Date(openedAt)) : '');

// Sort comparator: latest fill first. Trades with no fill sort last, and the
// sort is stable, so they keep their order.
export const byOpenedAtDesc = (a, b) => {
  if (!a.openedAt || !b.openedAt) return Boolean(b.openedAt) - Boolean(a.openedAt);
  return new Date(b.openedAt) - new Date(a.openedAt);
};
