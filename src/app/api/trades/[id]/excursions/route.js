import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { getTrade } from '@/db/trades';
import { barWindow, excursions } from '@/lib/excursions';
import { logError, requestId, withErrorLogging } from '@/lib/log';
import { tradeStatus } from '@/lib/tradeMetrics';

const BARS_URL = 'https://data.alpaca.markets/v2/stocks/bars';

const notFound = () => NextResponse.json({ error: 'Trade not found' }, { status: 404 });
const unavailable = (reason) => NextResponse.json({ excursions: null, reason });

// Returns { excursions: { mae, mfe, maeR, mfeR }, timeframe } for an open or
// closed stock trade, or { excursions: null, reason } when there is nothing
// to measure. Open trades are measured up to now.
export const GET = withErrorLogging('/api/trades/[id]/excursions', async (request, { params }) => {
  const { id } = await params;
  // Postgres rejects a malformed uuid with an error; to the client it's just not found.
  if (!z.uuid().safeParse(id).success) return notFound();

  const trade = await getTrade(getDb(), id);
  if (!trade) return notFound();
  if (tradeStatus(trade) === 'planned') {
    return NextResponse.json({ error: 'Record the entry first' }, { status: 409 });
  }
  // Options and crypto bars come from other Alpaca endpoints, and option bars
  // are too sparse to trust for a trade's range.
  if (trade.assetClass !== 'stock') return unavailable('MAE and MFE are only available for stocks so far');

  const keyId = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;
  if (!keyId || !secretKey) {
    return NextResponse.json(
      { error: 'Missing ALPACA_KEY_ID or ALPACA_SECRET_KEY in environment.' },
      { status: 500 }
    );
  }

  const { timeframe, start, end } = barWindow(trade);
  const query = new URLSearchParams({
    symbols: trade.symbol,
    timeframe,
    start: start.toISOString(),
    end: end.toISOString(),
    limit: '10000',
    // Fills are the actual prices of the day, so compare them with unadjusted bars.
    adjustment: 'raw',
    feed: 'iex',
  });

  const res = await fetch(`${BARS_URL}?${query}`, {
    headers: { 'APCA-API-KEY-ID': keyId, 'APCA-API-SECRET-KEY': secretKey },
    // A closed trade's bars never change; an open trade's grow every minute.
    ...(trade.closedAt ? { next: { revalidate: 86400 } } : { cache: 'no-store' }),
  });

  if (!res.ok) {
    const id = requestId(request);
    logError('Alpaca bars error', {
      route: '/api/trades/[id]/excursions',
      requestId: id,
      status: res.status,
      detail: (await res.text()).slice(0, 500),
    });
    return NextResponse.json(
      { error: `Upstream data provider returned ${res.status}`, requestId: id },
      { status: 502 }
    );
  }

  const json = await res.json();
  const result = excursions(trade, json.bars?.[trade.symbol] ?? []);
  if (!result) return unavailable('No price bars for the time the trade was open');

  return NextResponse.json({ excursions: result, timeframe });
});
