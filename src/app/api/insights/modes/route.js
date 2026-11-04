import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { listStrategies } from '@/db/strategies';
import { listAllClosedTrades } from '@/db/trades';
import { withErrorLogging } from '@/lib/log';
import { GRAD_N, graduation, modeComparison } from '@/lib/performance';

// Read fresh from the database on every request, never prerendered.
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  asset: z.enum(['stock', 'option', 'crypto']).optional(),
  // A strategy id, or 'none' for the trades taken without one.
  strategyId: z.union([z.literal('none'), z.uuid()]).optional(),
  optionType: z.enum(['call', 'put']).optional(),
});

// Query: ?asset=stock|option|crypto, ?strategyId=<id>|none, and ?optionType=call|put (all
// by default). Returns { modes, setups, gradN }
// over every closed trade, whatever its mode and year: the modes are compared
// with each other, and a setup's graduation counts build up over the years
// (docs/private/dashboard.md section 4 charts 11 and 12, and section 8). `setups`
// are the strategies with their name (null for the row of trades with none), and
// `gradN` is the trades in a graduation window, sent so the page doesn't import the
// detector code that lib/performance.js pulls in just to show the number.
export const GET = withErrorLogging('/api/insights/modes', async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
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

  const db = getDb();
  const [closed, strategies] = await Promise.all([
    listAllClosedTrades(db, {
      assetClass: parsed.data.asset,
      // 'none' is the trades with no strategy, which the query calls null.
      strategyId: parsed.data.strategyId === 'none' ? null : parsed.data.strategyId,
      optionType: parsed.data.optionType,
    }),
    listStrategies(db),
  ]);
  const names = new Map(strategies.map((strategy) => [strategy.id, strategy.name]));

  return NextResponse.json({
    gradN: GRAD_N,
    modes: modeComparison(closed),
    setups: graduation(closed).map((setup) => ({ ...setup, name: names.get(setup.strategyId) ?? null })),
  });
});
