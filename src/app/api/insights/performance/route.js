import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { listClosedTradesBetween } from '@/db/trades';
import { adherence, violationCosts } from '@/lib/adherence';
import { withErrorLogging } from '@/lib/log';
import { equityCurve, monthlySummary, rollingExpectancy, summarize, timeOfDay } from '@/lib/performance';

// Read fresh from the database on every request, never prerendered.
export const dynamic = 'force-dynamic';

const nyYear = () =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date()));

const querySchema = z.object({
  mode: z.enum(['live', 'paper', 'backtest']).default('live'),
  year: z.coerce.number().int().min(2000).max(2100).default(nyYear),
  asset: z.enum(['stock', 'option', 'crypto']).optional(),
});

// Query: ?mode=live|paper|backtest (live by default), ?year=YYYY (the current
// New York year by default), ?asset=stock|option|crypto (all by default).
// Returns { months, yearToDate, adherence, violationCosts, equity, rolling, timeOfDay } for trades closed in that
// New York calendar year (docs/private/dashboard.md sections 1 to 3).
export const GET = withErrorLogging('/api/insights/performance', async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    mode: searchParams.get('mode') ?? undefined,
    year: searchParams.get('year') ?? undefined,
    asset: searchParams.get('asset') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const { mode, year, asset } = parsed.data;
  // January 1 is always on standard time (UTC-5), so New York midnight is 05:00 UTC.
  const closed = await listClosedTradesBetween(getDb(), {
    from: new Date(`${year}-01-01T05:00:00Z`),
    to: new Date(`${year + 1}-01-01T05:00:00Z`),
    mode,
    assetClass: asset,
  });

  return NextResponse.json({
    months: monthlySummary(closed),
    yearToDate: summarize(closed),
    adherence: adherence(closed),
    violationCosts: violationCosts(closed),
    equity: equityCurve(closed),
    rolling: rollingExpectancy(closed),
    timeOfDay: timeOfDay(closed),
  });
});
