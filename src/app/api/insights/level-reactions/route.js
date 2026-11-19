import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { logError, requestId, withErrorLogging } from '@/lib/log';
import { symbolSchema } from '@/lib/symbol';
import { gatherLevelReactions } from '@/server/levelReactions';

const ROUTE = '/api/insights/level-reactions';

// Read fresh on every request, never prerendered.
export const dynamic = 'force-dynamic';

const nyYear = () =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date()));

const querySchema = z.object({
  symbol: symbolSchema.default('SPY'),
  year: z.coerce.number().int().min(2000).max(2100).default(nyYear),
});

// Query: ?symbol=SPY (the default) and ?year=YYYY (the current New York year by default; one
// year, never all, since a year of minute bars is already tens of thousands). Returns
// gatherLevelReactions' { symbol, year, sessions, kinds }: how price reacted to each level known
// at the open over the year's regular sessions (rules-v3 section 8, item 10). It reads a year of
// Alpaca bars, so the page asks for it on request. A failed fetch is logged and answered 502.
export const GET = withErrorLogging(ROUTE, async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    symbol: searchParams.get('symbol') ?? undefined,
    year: searchParams.get('year') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }
  if (!process.env.ALPACA_KEY_ID || !process.env.ALPACA_SECRET_KEY) {
    return NextResponse.json({ error: 'Missing ALPACA_KEY_ID or ALPACA_SECRET_KEY in environment.' }, { status: 500 });
  }

  try {
    return NextResponse.json(await gatherLevelReactions(getDb(), parsed.data));
  } catch (error) {
    const id = requestId(request);
    logError('Level reactions failed', { route: ROUTE, requestId: id, error });
    return NextResponse.json({ error: 'Could not fetch the bars to measure these levels', requestId: id }, { status: 502 });
  }
});
