// Helpers for an option's context at entry.

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const nyHour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' });

// The OCC symbol Alpaca uses for a contract: underlying, YYMMDD, C or P, and
// the strike in thousandths, padded to 8 digits. SPY 776C Oct 23 2026 is
// SPY261023C00776000.
export function occSymbol({ symbol, expiration, optionType, strike }) {
  const yymmdd = expiration.slice(2).replaceAll('-', '');
  const strikeCode = String(Math.round(strike * 1000)).padStart(8, '0');
  return `${symbol}${yymmdd}${optionType === 'call' ? 'C' : 'P'}${strikeCode}`;
}

// The bid-ask spread as a percent of the midpoint, or null without a
// two-sided quote.
export function spreadPercent(bid, ask) {
  const mid = (bid + ask) / 2;
  return bid > 0 && ask > 0 ? ((ask - bid) / mid) * 100 : null;
}

// 4 PM New York time on a 'YYYY-MM-DD' date: 20:00 UTC in daylight time,
// 21:00 UTC in standard time.
function closeOf(date) {
  const edt = new Date(`${date}T20:00:00Z`);
  return nyHour.format(edt) === '16' ? edt : new Date(`${date}T21:00:00Z`);
}

// Time from `at` to the 4 PM close on expiration day, in years (0 once past).
export const yearsToExpiration = (at, expiration) => Math.max(0, (closeOf(expiration) - at) / YEAR_MS);

// The one-standard-deviation move the option's implied volatility prices in
// by expiration: price x IV x sqrt(years). Null without a price or IV.
export function expectedMove(price, iv, years) {
  if (!price || !iv) return null;
  return price * iv * Math.sqrt(years);
}
