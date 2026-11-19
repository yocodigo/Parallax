import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { listDailyPlansBetween } from '@/db/dailyPlans';
import { listEntriesForTrades } from '@/db/journal';
import { listTradesOpenedOn } from '@/db/trades';
import { withErrorLogging } from '@/lib/log';
import { nyDay } from '@/lib/setups/session';
import { todaySummary } from '@/lib/today';

// Read fresh on every request, never prerendered.
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  day: z.iso.date({ error: 'Enter the day as a date' }).default(() => nyDay(new Date())),
  mode: z.enum(['live', 'paper', 'backtest']).default('live'),
});

// Query: ?day=YYYY-MM-DD (a New York date, today by default) and ?mode
// (live by default). Returns { day, mode, plans, summary }: every symbol's
// daily plan for the day, and todaySummary over the trades of that mode
// opened that day with their review entries.
export const GET = withErrorLogging('/api/today', async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    day: searchParams.get('day') ?? undefined,
    mode: searchParams.get('mode') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const { day, mode } = parsed.data;
  const db = getDb();
  const [plans, opened] = await Promise.all([
    listDailyPlansBetween(db, { fromDay: day, toDay: day }),
    listTradesOpenedOn(db, day),
  ]);
  const trades = opened.filter((trade) => trade.mode === mode);
  const entries = await listEntriesForTrades(db, trades.map((trade) => trade.id));
  const reviews = entries.filter((entry) => entry.kind === 'review');

  return NextResponse.json({ day, mode, plans, summary: todaySummary({ plans, trades, reviews }) });
});
