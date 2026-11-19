import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { getDailyPlan, saveDailyPlan } from '@/db/dailyPlans';
import { parseDailyPlan } from '@/lib/dailyPlan';
import { withErrorLogging } from '@/lib/log';
import { symbolSchema } from '@/lib/symbol';

// Read fresh from the database on every request, never prerendered.
export const dynamic = 'force-dynamic';

const querySchema = z.object({ tradeDate: z.iso.date({ error: 'Enter the day as a date' }), symbol: symbolSchema });

// Query: tradeDate (a New York 'YYYY-MM-DD' date) and symbol. Returns
// { plan }, null if that symbol's day was never planned.
export const GET = withErrorLogging('/api/daily-plan', async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid day', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const plan = await getDailyPlan(getDb(), parsed.data.tradeDate, parsed.data.symbol);
  return NextResponse.json({ plan });
});

// Body: tradeDate, symbol and, all optional, the working fib (ltfDirection, ltfFib50,
// ltfFib100), the second fib (htfDirection/htfFib50/htfFib100), the overnight
// highs and lows (asiaHigh, asiaLow, londonHigh, londonLow, premarketHigh,
// premarketLow), and notes; a fib is given whole or not at all. Replaces the
// plan of the day and symbol. Returns { plan }.
export const PUT = withErrorLogging('/api/daily-plan', async (request) => {
  const body = await request.json().catch(() => null);
  const parsed = parseDailyPlan(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid daily plan', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const plan = await saveDailyPlan(getDb(), parsed.data);
  return NextResponse.json({ plan });
});
