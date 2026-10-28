import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { listClosedTrades } from '@/db/trades';
import { logError, requestId, withErrorLogging } from '@/lib/log';
import { replayTrades } from '@/lib/setups/replayTrades';
import { sessionBars, tradingDay } from '@/lib/setups/session';

const ROUTE = '/api/insights/stops';
const BARS_URL = 'https://data.alpaca.markets/v2/stocks/bars';
const DAY_MS = 24 * 60 * 60 * 1000;
// S3 needs each trade's T1, from the daily fib levels still to come.
const RULE_SETS = [['S1'], ['S2'], ['S1', 'S2']];

// Read fresh from the database on every request, never prerendered.
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  mode: z.enum(['live', 'paper', 'backtest']).optional(),
});

const dayOf = (trade) => tradingDay({ t: trade.openedAt.toISOString() });

// SPY's 1m bars from `start` to `end`, following Alpaca's pages.
async function fetchBars(start, end, headers) {
  const bars = [];
  let pageToken = null;
  do {
    const query = new URLSearchParams({
      symbols: 'SPY',
      timeframe: '1Min',
      start: start.toISOString(),
      end: end.toISOString(),
      limit: '10000',
      // Like the excursions route: the day's actual prices, from the free feed.
      adjustment: 'raw',
      feed: 'iex',
    });
    if (pageToken) query.set('page_token', pageToken);
    // Past days' bars never change.
    const res = await fetch(`${BARS_URL}?${query}`, { headers, next: { revalidate: 86400 } });
    if (!res.ok) return { error: { status: res.status, detail: (await res.text()).slice(0, 500) } };
    const json = await res.json();
    bars.push(...(json.bars?.SPY ?? []));
    pageToken = json.next_page_token;
  } while (pageToken);
  return { bars };
}

// Query: ?mode=live|paper|backtest, or none for every trade.
// Replays the closed SPY trades (options on SPY, or SPY itself) under each
// rule set and returns replayTrades' { replayed, skipped, ruleSets }.
export const GET = withErrorLogging(ROUTE, async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ mode: searchParams.get('mode') ?? undefined });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid mode', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const closed = await listClosedTrades(getDb(), { symbol: 'SPY', ...parsed.data });
  if (closed.length === 0) return NextResponse.json(replayTrades([], () => [], RULE_SETS));

  const keyId = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;
  if (!keyId || !secretKey) {
    return NextResponse.json({ error: 'Missing ALPACA_KEY_ID or ALPACA_SECRET_KEY in environment.' }, { status: 500 });
  }
  const headers = { 'APCA-API-KEY-ID': keyId, 'APCA-API-SECRET-KEY': secretKey };

  // One fetch per trading day, reaching back a few days so the 5m bands have
  // history at the open.
  const byDay = new Map();
  for (const trade of closed) {
    const day = dayOf(trade);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(trade);
  }
  const barsByDay = new Map();
  for (const [day, dayTrades] of byDay) {
    const first = dayTrades[0].openedAt.getTime();
    const last = dayTrades.at(-1).openedAt.getTime();
    const end = new Date(Math.min(last + DAY_MS, Date.now()));
    const { bars, error } = await fetchBars(new Date(first - 4 * DAY_MS), end, headers);
    if (error) {
      const id = requestId(request);
      logError('Alpaca bars error', { route: ROUTE, requestId: id, ...error });
      return NextResponse.json(
        { error: `Upstream data provider returned ${error.status}`, requestId: id },
        { status: 502 }
      );
    }
    barsByDay.set(day, sessionBars(bars));
  }

  return NextResponse.json(replayTrades(closed, (trade) => barsByDay.get(dayOf(trade)), RULE_SETS));
});
