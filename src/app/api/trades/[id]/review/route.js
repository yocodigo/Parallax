import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { getTrade } from '@/db/trades';
import { withErrorLogging } from '@/lib/log';
import { reviewEntry } from '@/lib/setups/entryReview';
import { sessionBars } from '@/lib/setups/session';
import { fetchMinuteBars } from '@/server/minuteBars';

const notFound = () => NextResponse.json({ error: 'Trade not found' }, { status: 404 });

// Returns { review }: a recorded trade's entry review (setups.md section 10),
// measured from the underlying's minute bars that closed before the fill.
// `review` is null, with a reason, when there's nothing to measure it from.
export const GET = withErrorLogging('/api/trades/[id]/review', async (request, { params }) => {
  const { id } = await params;
  // Postgres rejects a malformed uuid with an error; to the client it's just not found.
  if (!z.uuid().safeParse(id).success) return notFound();

  const trade = await getTrade(getDb(), id);
  if (!trade) return notFound();
  if (!trade.openedAt) {
    return NextResponse.json({ error: 'Record the entry first' }, { status: 409 });
  }
  // Crypto bars come from a different Alpaca endpoint, not wired up yet.
  if (trade.assetClass === 'crypto') {
    return NextResponse.json({ review: null, reason: 'The entry review is only available for stocks and options so far' });
  }

  if (!process.env.ALPACA_KEY_ID || !process.env.ALPACA_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Missing ALPACA_KEY_ID or ALPACA_SECRET_KEY in environment.' },
      { status: 500 }
    );
  }

  // `symbol` is the underlying for both stocks and options (domain rules).
  const bars = sessionBars(await fetchMinuteBars(trade.symbol, trade.openedAt));
  return NextResponse.json({ review: reviewEntry(trade, bars) });
});
