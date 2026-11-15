// Alpaca's minute bars for one option contract (its OCC symbol), for heat on
// winners. Server-only: it reads the Alpaca keys from the environment. A
// contract has a bar only for minutes it traded, so a thin one has gaps.

const BARS_URL = 'https://data.alpaca.markets/v1beta1/options/bars';

// The bars from `start` to `end`, oldest first; [] when it never traded then.
// A past window's bars never change, so they are cached for a day.
export async function fetchOptionBars(contract, start, end) {
  const query = new URLSearchParams({
    symbols: contract,
    timeframe: '1Min',
    start: start.toISOString(),
    end: end.toISOString(),
    limit: '10000',
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
  return bars?.[contract] ?? [];
}
