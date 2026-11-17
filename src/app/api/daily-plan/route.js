import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { getDailyPlan, saveDailyPlan } from '@/db/dailyPlans';
import { parseDailyPlan } from '@/lib/dailyPlan';
import { withErrorLogging } from '@/lib/log';

// Read fresh from the database on every request, never prerendered.
export const dynamic = 'force-dynamic';

const querySchema = z.object({ tradeDate: z.iso.date({ error: 'Enter the day as a date' }) });

// Query: tradeDate (a New York 'YYYY-MM-DD' date). Returns { plan }, null if
// the day was never planned.
export const GET = withErrorLogging('/api/daily-plan', async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid day', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const plan = await getDailyPlan(getDb(), parsed.data.tradeDate);
  return NextResponse.json({ plan });
});

// Body: tradeDate and, all optional, the working fib (ltfDirection, ltfFib50,
// ltfFib100), the second fib (htfDirection/htfFib50/htfFib100), and notes; a
// fib is given whole or not at all. Replaces the day's plan. Returns { plan }.
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
