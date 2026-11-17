import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { getDailyPlan } from '@/db/dailyPlans';
import { getPlanEntry } from '@/db/journal';
import { getTrade } from '@/db/trades';
import { withErrorLogging } from '@/lib/log';
import { sessionBars } from '@/lib/setups/session';
import { gradeTradeGates, levelsAtEntry } from '@/lib/setups/tradeGates';
import { fetchDailyBars } from '@/server/dailyBars';
import { fetchMinuteBars } from '@/server/minuteBars';

const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });

const notFound = () => NextResponse.json({ error: 'Trade not found' }, { status: 404 });

// Returns { gates, location, room }: a recorded trade's pre-entry gates
// (section 8), graded from the underlying's minute bars, the day's plan, and
// the trade's own plan entry; and where its entry sat among the day's levels
// (rules-v3 4: Location OK's level and event, and the room to the next level),
// read from the minute bars, the daily bars before the day, and the plan's
// overnight levels. `gates` is null, with a reason, when there's nothing to
// grade it from yet.
export const GET = withErrorLogging('/api/trades/[id]/gates', async (request, { params }) => {
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
    return NextResponse.json({ gates: null, reason: 'Gates are only available for stocks and options so far' });
  }

  const keyId = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;
  if (!keyId || !secretKey) {
    return NextResponse.json(
      { error: 'Missing ALPACA_KEY_ID or ALPACA_SECRET_KEY in environment.' },
      { status: 500 }
    );
  }

  // `symbol` is the underlying for both stocks and options (domain rules).
  const day = nyDate.format(trade.openedAt);
  const [minuteBars, dailyBars, dailyPlan, planEntry] = await Promise.all([
    fetchMinuteBars(trade.symbol, trade.openedAt),
    fetchDailyBars(trade.symbol, day),
    getDailyPlan(getDb(), day),
    getPlanEntry(getDb(), trade.id),
  ]);
  const bars = sessionBars(minuteBars);

  const { location, room } = levelsAtEntry(trade, bars, { dailyBars, dailyPlan });
  const gates = gradeTradeGates(trade, bars, { dailyPlan, planEntry, location });
  return NextResponse.json({ gates, location, room });
});
