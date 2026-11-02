import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { getDailyPlan } from '@/db/dailyPlans';
import { getTrade } from '@/db/trades';
import { withErrorLogging } from '@/lib/log';
import { reviewExit } from '@/lib/setups/exitReview';
import { sessionBars } from '@/lib/setups/session';
import { fetchMinuteBars } from '@/server/minuteBars';

const DAY_MS = 24 * 60 * 60 * 1000;

const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });

const notFound = () => NextResponse.json({ error: 'Trade not found' }, { status: 404 });

// Returns { review }: a closed trade's exit review (setups.md section 10, after
// the exit): the reaction at T1 and whether the exit matched step 5. `review`
// is null, with a reason, when there's nothing to grade it from.
export const GET = withErrorLogging('/api/trades/[id]/exit-review', async (request, { params }) => {
  const { id } = await params;
  // Postgres rejects a malformed uuid with an error; to the client it's just not found.
  if (!z.uuid().safeParse(id).success) return notFound();

  const trade = await getTrade(getDb(), id);
  if (!trade) return notFound();
  if (!trade.openedAt || !trade.closedAt) {
    return NextResponse.json({ error: 'Record the exit first' }, { status: 409 });
  }
  // Crypto bars come from a different Alpaca endpoint, not wired up yet.
  if (trade.assetClass === 'crypto') {
    return NextResponse.json({ review: null, reason: 'The exit review is only available for stocks and options so far' });
  }

  if (!process.env.ALPACA_KEY_ID || !process.env.ALPACA_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Missing ALPACA_KEY_ID or ALPACA_SECRET_KEY in environment.' },
      { status: 500 }
    );
  }

  // The reaction at T1 is graded after the exit, so the bars run on past it: a
  // day from the fill reaches the close of the fill's session, and what comes
  // after is left out by reviewExit. Not past now.
  const end = new Date(Math.min(Date.now(), trade.openedAt.getTime() + DAY_MS));
  // `symbol` is the underlying for both stocks and options (domain rules).
  const bars = sessionBars(await fetchMinuteBars(trade.symbol, end));
  const dailyPlan = await getDailyPlan(getDb(), nyDate.format(trade.openedAt));

  return NextResponse.json({ review: reviewExit(trade, bars, dailyPlan) });
});
