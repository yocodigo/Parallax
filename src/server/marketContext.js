import { buildContext } from '@/lib/context/buildContext';
import { occSymbol } from '@/lib/context/options';
import { parseVixCsv } from '@/lib/context/vix';
import { logError } from '@/lib/log';

// Fetches what a trade's context snapshot needs and builds it. Server-only:
// it reads the Alpaca keys from the environment.

const BARS_URL = 'https://data.alpaca.markets/v2/stocks/bars';
const OPTION_SNAPSHOTS_URL = 'https://data.alpaca.markets/v1beta1/options/snapshots';
const VIX_URL = 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv';
const tradingHost = () => process.env.ALPACA_TRADING_HOST || 'https://paper-api.alpaca.markets';

const DAY_MS = 24 * 60 * 60 * 1000;
// Enough calendar days for 50 sessions of daily closes.
const DAILY_LOOKBACK_DAYS = 100;
// Reaches back past the 9:30 open from any time in the session.
const INTRADAY_LOOKBACK_MS = 8 * 60 * 60 * 1000;

const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });

// How each source is named in the logs.
const SOURCE_NAMES = { daily: 'dailyBars', intraday: 'minuteBars', vixRows: 'vix', option: 'option' };

function alpacaHeaders() {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_KEY_ID,
    'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
  };
}

async function getJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// Split-adjusted, so a split doesn't break the moving averages.
async function fetchBars(symbols, timeframe, start, end) {
  const query = new URLSearchParams({
    symbols: symbols.join(','),
    timeframe,
    start,
    end,
    limit: '10000',
    adjustment: 'split',
    feed: 'iex',
  });
  const json = await getJson(`${BARS_URL}?${query}`, { headers: alpacaHeaders(), cache: 'no-store' });
  return json.bars ?? {};
}

async function fetchVixRows() {
  // The history only gains a row a day.
  const res = await fetch(VIX_URL, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`${res.status} from Cboe`);
  return parseVixCsv(await res.text());
}

async function fetchOption(trade) {
  const contract = occSymbol(trade);
  const [details, snapshots] = await Promise.all([
    getJson(`${tradingHost()}/v2/options/contracts/${contract}`, { headers: alpacaHeaders(), cache: 'no-store' }),
    getJson(`${OPTION_SNAPSHOTS_URL}?symbols=${contract}&feed=indicative`, {
      headers: alpacaHeaders(),
      cache: 'no-store',
    }),
  ]);
  const snapshot = snapshots.snapshots?.[contract];
  return {
    // As of the previous session; Alpaca sends it as a string.
    openInterest: details.open_interest ? Number(details.open_interest) : null,
    bid: snapshot?.latestQuote?.bp ?? null,
    ask: snapshot?.latestQuote?.ap ?? null,
    iv: snapshot?.impliedVolatility ?? null,
    delta: snapshot?.greeks?.delta ?? null,
  };
}

// The context of `trade` at its entry (`openedAt`). Each source is fetched on
// its own; one that fails is logged and its part of the snapshot left empty,
// so a slow or down provider never loses the rest. `requestId` ties the logs
// to the request that recorded the entry.
export async function captureContext(trade, { now = new Date(), requestId } = {}) {
  const entryDate = nyDate.format(trade.openedAt);
  const dayBefore = nyDate.format(new Date(Date.parse(entryDate) - DAY_MS / 2));
  const symbols = [...new Set(['SPY', 'QQQ', trade.symbol])];

  const sources = {
    daily: fetchBars(
      symbols,
      '1Day',
      new Date(Date.parse(entryDate) - DAILY_LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10),
      dayBefore
    ),
    intraday: fetchBars(
      symbols,
      '1Min',
      new Date(trade.openedAt.getTime() - INTRADAY_LOOKBACK_MS).toISOString(),
      trade.openedAt.toISOString()
    ),
    vixRows: fetchVixRows(),
    option: trade.assetClass === 'option' ? fetchOption(trade) : Promise.resolve(null),
  };

  const names = Object.keys(sources);
  const settled = await Promise.allSettled(Object.values(sources));
  const fetched = {};
  settled.forEach((result, i) => {
    const source = names[i];
    if (result.status === 'fulfilled') {
      fetched[source] = result.value;
    } else {
      logError('Context source failed', {
        source: SOURCE_NAMES[source],
        requestId,
        tradeSymbol: trade.symbol,
        error: result.reason,
      });
      fetched[source] = source === 'daily' || source === 'intraday' ? {} : null;
    }
  });

  return buildContext({ trade, now, ...fetched });
}
