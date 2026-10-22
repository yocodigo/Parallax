import { NextResponse } from 'next/server';
import { mapPositions } from '@/lib/positions';
import { logError, requestId, withErrorLogging } from '@/lib/log';
import { concentration } from '@/lib/risk';

// Note: positions live on the trading host, NOT the market-data host.
const TRADING_HOST = process.env.ALPACA_TRADING_HOST || 'https://paper-api.alpaca.markets';
const TRADING_URL = `${TRADING_HOST}/v2/positions`;

// Fetch the account's open positions and derive concentration metrics.
export const GET = withErrorLogging('/api/positions', async (request) => {
  const keyId = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;

  if (!keyId || !secretKey) {
    return NextResponse.json(
      { error: 'Missing ALPACA_KEY_ID or ALPACA_SECRET_KEY in environment.' },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(TRADING_URL, {
      headers: {
        'APCA-API-KEY-ID': keyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
      cache: 'no-store', // positions are live P&L — do not cache
    });

    if (!res.ok) {
      // Log full detail server-side; return only a status to the client.
      const detail = await res.text();
      const id = requestId(request);
      logError('Alpaca positions error', {
        route: '/api/positions',
        requestId: id,
        status: res.status,
        detail: detail.slice(0, 500),
      });
      return NextResponse.json(
        { error: `Alpaca returned ${res.status}`, requestId: id },
        { status: res.status }
      );
    }

    const raw = await res.json();
    const positions = mapPositions(raw);
    const { weights, top } = concentration(positions);

    return NextResponse.json({ positions, weights, top });
  } catch (err) {
    const id = requestId(request);
    logError('Alpaca positions request failed', { route: '/api/positions', requestId: id, error: err });
    return NextResponse.json(
      { error: 'Request to Alpaca failed', requestId: id },
      { status: 502 }
    );
  }
});
