import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { getTradeContext } from '@/db/contexts';
import { withErrorLogging } from '@/lib/log';

// Returns { context }: the market context captured at entry, or null.
export const GET = withErrorLogging('/api/trades/[id]/context', async (request, { params }) => {
  const { id } = await params;
  // Postgres rejects a malformed uuid with an error; to the client it's just not found.
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
  }

  return NextResponse.json({ context: await getTradeContext(getDb(), id) });
});
