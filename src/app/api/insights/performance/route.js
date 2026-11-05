import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { listStrategies } from '@/db/strategies';
import { listClosedTradesBetween, listPlanFacts } from '@/db/trades';
import { adherence, disciplineByMonth, violationCosts } from '@/lib/adherence';
import { withErrorLogging } from '@/lib/log';
import { byUnderlying, bySetup, callsVsPuts, equityCurve, monthlySummary, rDistribution, rollingExpectancy, summarize, timeOfDay } from '@/lib/performance';

// Read fresh from the database on every request, never prerendered.
export const dynamic = 'force-dynamic';

const nyYear = () =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date()));

const querySchema = z.object({
  mode: z.enum(['live', 'paper', 'backtest']).default('live'),
  year: z.union([z.literal('all'), z.coerce.number().int().min(2000).max(2100)]).default(nyYear),
  asset: z.enum(['stock', 'option', 'crypto']).optional(),
  // A strategy id, or 'none' for the trades taken without one.
  strategyId: z.union([z.literal('none'), z.uuid()]).optional(),
  optionType: z.enum(['call', 'put']).optional(),
});

// Query: ?mode=live|paper|backtest (live by default), ?year=YYYY (the current
// New York year by default) or ?year=all (every year), ?asset=stock|option|crypto, ?strategyId=<id>|none
// (the setup), and ?optionType=call|put (which leaves out stocks and crypto); all
// of the last three by default.
// Returns { months, yearToDate, adherence, violationCosts, equity, rolling, timeOfDay, callsVsPuts, byUnderlying, bySetup, rDistribution, disciplineByMonth } for trades closed in that
// New York calendar year (`yearToDate` is then the whole range, and `rolling` runs on through the years) (docs/private/dashboard.md sections 1 to 3).
export const GET = withErrorLogging('/api/insights/performance', async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    mode: searchParams.get('mode') ?? undefined,
    year: searchParams.get('year') ?? undefined,
    asset: searchParams.get('asset') ?? undefined,
    strategyId: searchParams.get('strategyId') ?? undefined,
    optionType: searchParams.get('optionType') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const { mode, year, asset, strategyId, optionType } = parsed.data;
  // January 1 is always on standard time (UTC-5), so New York midnight is 05:00 UTC.
  const closed = await listClosedTradesBetween(getDb(), {
    from: year === 'all' ? undefined : new Date(`${year}-01-01T05:00:00Z`),
    to: year === 'all' ? undefined : new Date(`${year + 1}-01-01T05:00:00Z`),
    mode,
    assetClass: asset,
    // 'none' is the trades with no strategy, which the query calls null.
    strategyId: strategyId === 'none' ? null : strategyId,
    optionType,
  });

  // Rule adherence also needs each trade's plan entry and checklist answers.
  const facts = await listPlanFacts(
    getDb(),
    closed.map((trade) => trade.id)
  );
  const withFacts = closed.map((trade) => ({ ...trade, ...facts.get(trade.id) }));

  const names = new Map((await listStrategies(getDb())).map((strategy) => [strategy.id, strategy.name]));

  return NextResponse.json({
    months: monthlySummary(closed),
    yearToDate: summarize(closed),
    adherence: adherence(withFacts),
    disciplineByMonth: disciplineByMonth(withFacts),
    violationCosts: violationCosts(closed),
    equity: equityCurve(closed),
    rolling: rollingExpectancy(closed),
    timeOfDay: timeOfDay(closed),
    callsVsPuts: callsVsPuts(closed),
    byUnderlying: byUnderlying(closed),
    bySetup: bySetup(closed).map((setup) => ({ ...setup, name: names.get(setup.strategyId) ?? null })),
    rDistribution: rDistribution(closed),
  });
});
