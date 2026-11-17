// Alpaca's daily bars for the level map's prior day and prior week levels
// (rules-v3 3). Server-only: it reads the Alpaca keys from the environment.

const BARS_URL = 'https://data.alpaca.markets/v2/stocks/bars';
const DAY_MS = 24 * 60 * 60 * 1000;
// Three weeks of calendar days covers the prior week from any day of the
// current one, holidays included.
const LOOKBACK_DAYS = 21;

const shift = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// The daily bars of `symbol` (an underlying) for the days before `day` (a New
// York 'YYYY-MM-DD' date), oldest first, split-adjusted from the IEX feed like
// the minute bars. The day's own bar is never asked for: it is still forming.
// Finished days don't change, so they are cached for a day.
export async function fetchDailyBars(symbol, day) {
  const query = new URLSearchParams({
    symbols: symbol,
    timeframe: '1Day',
    start: shift(day, -LOOKBACK_DAYS),
    end: shift(day, -1),
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
