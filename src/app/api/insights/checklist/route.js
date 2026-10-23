import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { listClosedTradesWithRuleChecks } from '@/db/trades';
import { checklistReport } from '@/lib/checklistReport';
import { withErrorLogging } from '@/lib/log';

// Read fresh from the database on every request, never prerendered.
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  mode: z.enum(['live', 'paper', 'backtest']).optional(),
});

// Query: ?mode=live|paper|backtest, or none for every trade.
// Returns { followed, broken, rules, trades } from checklistReport.
export const GET = withErrorLogging('/api/insights/checklist', async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ mode: searchParams.get('mode') ?? undefined });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid mode', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const trades = await listClosedTradesWithRuleChecks(getDb(), parsed.data);
  return NextResponse.json(checklistReport(trades));
});
