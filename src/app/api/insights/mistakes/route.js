import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { listClosedTradesWithMistakes } from '@/db/trades';
import { withErrorLogging } from '@/lib/log';
import { mistakeLedger } from '@/lib/mistakeLedger';

// Read fresh from the database on every request, never prerendered.
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  mode: z.enum(['live', 'paper', 'backtest']).optional(),
});

// Query: ?mode=live|paper|backtest, or none for every trade.
// Returns { mistakes, baseline, trades } from mistakeLedger.
export const GET = withErrorLogging('/api/insights/mistakes', async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ mode: searchParams.get('mode') ?? undefined });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid mode', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const trades = await listClosedTradesWithMistakes(getDb(), parsed.data);
  return NextResponse.json(mistakeLedger(trades));
});
