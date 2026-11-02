// Alpaca's minute bars for the entry and exit reviews. Server-only: it reads
// the Alpaca keys from the environment.

const BARS_URL = 'https://data.alpaca.markets/v2/stocks/bars';
// Reaches back far enough to include a full previous session's bars (needed
// for the 15m bands' 20-bar history), even across a weekend or a holiday.
const LOOKBACK_MS = 5 * 24 * 60 * 60 * 1000;

// The minute bars of `symbol` (an underlying) ending at `end`, oldest first,
// split-adjusted from the IEX feed.
export async function fetchMinuteBars(symbol, end) {
  const query = new URLSearchParams({
    symbols: symbol,
    timeframe: '1Min',
    start: new Date(end.getTime() - LOOKBACK_MS).toISOString(),
    end: end.toISOString(),
    limit: '10000',
    adjustment: 'split',
    feed: 'iex',
  });
  const res = await fetch(`${BARS_URL}?${query}`, {
    headers: {
      'APCA-API-KEY-ID': process.env.ALPACA_KEY_ID,
      'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${res.status} from Alpaca: ${(await res.text()).slice(0, 300)}`);
  const { bars } = await res.json();
  return bars?.[symbol] ?? [];
}
