import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { getTrade, recordEntry } from '@/db/trades';
import { withErrorLogging } from '@/lib/log';
import { parseTradeEntry } from '@/lib/tradeFill';
import { tradeStatus } from '@/lib/tradeMetrics';

const notFound = () => NextResponse.json({ error: 'Trade not found' }, { status: 404 });
const alreadyEntered = () =>
  NextResponse.json({ error: 'This trade already has an entry' }, { status: 409 });

// Body: { entryPrice, openedAt }. Returns { trade }, now open.
export const POST = withErrorLogging('/api/trades/[id]/entry', async (request, { params }) => {
  const { id } = await params;
  // Postgres rejects a malformed uuid with an error; to the client it's just not found.
  if (!z.uuid().safeParse(id).success) return notFound();

  const trade = await getTrade(getDb(), id);
  if (!trade) return notFound();
  if (tradeStatus(trade) !== 'planned') return alreadyEntered();

  const body = await request.json().catch(() => null);
  const parsed = parseTradeEntry(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid entry', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  // Null if another request recorded an entry since the check above.
  const updated = await recordEntry(getDb(), id, parsed.data);
  if (!updated) return alreadyEntered();

  return NextResponse.json({ trade: updated });
});
