import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { getTrade, recordExit } from '@/db/trades';
import { withErrorLogging } from '@/lib/log';
import { parseTradeExit } from '@/lib/tradeFill';
import { tradeStatus } from '@/lib/tradeMetrics';

const notFound = () => NextResponse.json({ error: 'Trade not found' }, { status: 404 });
const conflict = (error) => NextResponse.json({ error }, { status: 409 });

const WRONG_STATE = {
  planned: 'Record the entry first',
  closed: 'This trade is already closed',
};

// Body: { exitPrice, closedAt, exitReason, exitedPerPlan, fees? }. Returns
// { trade }, now closed.
export const POST = withErrorLogging('/api/trades/[id]/exit', async (request, { params }) => {
  const { id } = await params;
  // Postgres rejects a malformed uuid with an error; to the client it's just not found.
  if (!z.uuid().safeParse(id).success) return notFound();

  const trade = await getTrade(getDb(), id);
  if (!trade) return notFound();
  const status = tradeStatus(trade);
  if (status !== 'open') return conflict(WRONG_STATE[status]);

  const body = await request.json().catch(() => null);
  const parsed = parseTradeExit(body, trade);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid exit', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  // Null if another request closed the trade since the check above.
  const updated = await recordExit(getDb(), id, parsed.data);
  if (!updated) return conflict(WRONG_STATE.closed);

  return NextResponse.json({ trade: updated });
});
