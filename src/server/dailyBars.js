// Alpaca's daily bars for the level map's prior day, week, and month levels
// (rules-v3 3). Server-only: it reads the Alpaca keys from the environment.

const BARS_URL = 'https://data.alpaca.markets/v2/stocks/bars';
const DAY_MS = 24 * 60 * 60 * 1000;
// Two months of calendar days reach the first of the prior month from the
// last day of the current one (31 + 31 = 62), holidays included.
export const LOOKBACK_DAYS = 62;

export const shift = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// The daily bars of `symbol` (an underlying) for the New York dates from `first`
// through `last` ('YYYY-MM-DD', both included), oldest first, split-adjusted from
// the IEX feed like the minute bars. Finished days don't change, so they are
// cached for a day.
export async function fetchDailyBarsBetween(symbol, first, last) {
  const query = new URLSearchParams({
    symbols: symbol,
    timeframe: '1Day',
    start: first,
    end: last,
    limit: '10000',
    adjustment: 'split',
    feed: 'iex',
  });
  const res = await fetch(`${BARS_URL}?${query}`, {
    headers: {
      'APCA-API-KEY-ID': process.env.ALPACA_KEY_ID,
      'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
    },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`${res.status} from Alpaca: ${(await res.text()).slice(0, 300)}`);
  const { bars } = await res.json();
  return bars?.[symbol] ?? [];
}

// The daily bars before `day` (a New York 'YYYY-MM-DD' date) that the level map
// reads. The day's own bar is never asked for: it is still forming.
export const fetchDailyBars = (symbol, day) => fetchDailyBarsBetween(symbol, shift(day, -LOOKBACK_DAYS), shift(day, -1));
