import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { logError, requestId, withErrorLogging } from '@/lib/log';
import { gatherOptionExcursions } from '@/server/optionExcursions';

const ROUTE = '/api/insights/option-excursions';

// Read fresh on every request, never prerendered.
export const dynamic = 'force-dynamic';

const nyYear = () =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date()));

const querySchema = z.object({
  mode: z.enum(['live', 'paper', 'backtest']).default('live'),
  year: z.union([z.literal('all'), z.coerce.number().int().min(2000).max(2100)]).default(nyYear),
});

// Query: ?mode=live|paper|backtest (live by default) and ?year=YYYY (the
// current New York year by default) or ?year=all. Returns gatherOptionExcursions'
// { heat: { rows, summary, summaryAll }, afterExit: { rows, summary } } for the
// option trades of that mode closed in that New York year (rules-v3 section 8,
// items 3 and 8). It reads Alpaca's bars for every trade, so the page asks for
// it on request rather than on load. A failed fetch is logged and answered 502.
export const GET = withErrorLogging(ROUTE, async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    mode: searchParams.get('mode') ?? undefined,
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

  const { mode, year } = parsed.data;
  // January 1 is always on standard time (UTC-5), so New York midnight is 05:00 UTC.
  const range =
    year === 'all'
      ? { from: undefined, to: undefined }
      : { from: new Date(`${year}-01-01T05:00:00Z`), to: new Date(`${year + 1}-01-01T05:00:00Z`) };

  try {
    return NextResponse.json(await gatherOptionExcursions(getDb(), { mode, ...range }));
  } catch (error) {
    const id = requestId(request);
    logError('Option excursions failed', { route: ROUTE, requestId: id, error });
    return NextResponse.json({ error: 'Could not fetch the bars to measure these trades', requestId: id }, { status: 502 });
  }
});
