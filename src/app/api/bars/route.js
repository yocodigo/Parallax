import { NextResponse } from 'next/server';
import { reshapeBars, summarize } from '@/lib/bars';
import { parseBarsParams } from '@/lib/params';
import { correlationMatrix } from '@/lib/correlation';
import { rateLimit, clientKey } from '@/lib/rateLimit';

const DATA_URL = 'https://data.alpaca.markets/v2/stocks/bars';

// Pull daily bars for the requested symbols and reshape them into a single
// time-ordered series suitable for charting.
export async function GET(request) {
  const keyId = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;
  const limit = rateLimit(clientKey(request));

  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429 }
    );
  }

  if (!keyId || !secretKey) {
    return NextResponse.json(
      { error: 'Missing ALPACA_KEY_ID or ALPACA_SECRET_KEY in environment.' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
    const parsed = parseBarsParams(searchParams);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid parameters' },
        { status: 400 }
      );
    }
    const { symbols, days, timeframe } = parsed.data;

  // Alpaca's free data feed is delayed, so end the window yesterday to avoid
  // requesting bars that do not exist yet.
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);

  const query = new URLSearchParams({
    symbols: symbols.join(','),
    timeframe,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    limit: '10000',
    adjustment: 'split',
    feed: 'iex',
  });

  try {
    const res = await fetch(`${DATA_URL}?${query}`, {
          headers: {
            'APCA-API-KEY-ID': keyId,
            'APCA-API-SECRET-KEY': secretKey,
          },
          next: { revalidate: 3600 },
        });

        if (!res.ok) {
        // Log full detail server-side; return only a status to the client.
      const detail = await res.text();
      console.error(`Alpaca bars error ${res.status}: ${detail.slice(0, 500)}`);
      return NextResponse.json(
        { error: `Upstream data provider returned ${res.status}` },
        { status: res.status }
      );
    }

    const json = await res.json();
    const bars = json.bars || {};

    const series = reshapeBars(bars);
    const summary = summarize(bars, symbols);

    // Build { SYMBOL: closes[] } from the same bars, for correlation.
    const closesBySymbol = {};
    for (const symbol of Object.keys(bars)) {
      closesBySymbol[symbol] = bars[symbol].map((b) => b.c);
    }
    const correlation = correlationMatrix(closesBySymbol);

    return NextResponse.json({
      symbols: summary.map((s) => s.symbol),
      summary,
      series,
      correlation,
      timeframe,
      window: { start: query.get('start'), end: query.get('end') },
    });

  } catch (err) {
    return NextResponse.json(
      { error: 'Request to data provider failed' },
      { status: 502 }
    );
  }
}
