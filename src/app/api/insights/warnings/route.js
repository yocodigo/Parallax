import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { listClosedTradesWithMistakes } from '@/db/trades';
import { historyWarnings } from '@/lib/historyWarnings';
import { withErrorLogging } from '@/lib/log';

// Read fresh from the database on every request, never prerendered.
export const dynamic = 'force-dynamic';

// The plan being written. The symbol may still be blank or half typed.
const querySchema = z.object({
  mode: z.enum(['live', 'paper', 'backtest']),
  direction: z.enum(['long', 'short']),
  assetClass: z.enum(['stock', 'option', 'crypto']),
  symbol: z.string().trim().max(10).optional(),
  // An option plan's expiration; blank until it's filled in.
  expiration: z.preprocess((value) => value || undefined, z.iso.date().optional()),
});

// Query: mode, direction, assetClass, and optionally symbol and (for an
// option) expiration of a plan.
// Returns { warnings } from the trader's closed trades in the same mode.
export const GET = withErrorLogging('/api/insights/warnings', async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid plan', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const { mode, ...plan } = parsed.data;
  const trades = await listClosedTradesWithMistakes(getDb(), { mode });
  return NextResponse.json({ warnings: historyWarnings(plan, trades) });
});
