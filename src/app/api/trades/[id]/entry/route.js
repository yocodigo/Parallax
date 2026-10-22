import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { loadBreakerStatus } from '@/db/settings';
import { getStrategy } from '@/db/strategies';
import { getTrade, recordEntry } from '@/db/trades';
import { withErrorLogging } from '@/lib/log';
import { parseRuleChecks, unmetRules } from '@/lib/strategy';
import { parseTradeEntry } from '@/lib/tradeFill';
import { tradeStatus } from '@/lib/tradeMetrics';

const notFound = () => NextResponse.json({ error: 'Trade not found' }, { status: 404 });
const alreadyEntered = () =>
  NextResponse.json({ error: 'This trade already has an entry' }, { status: 409 });

// Body: { entryPrice, openedAt, ruleChecks?, override? }. Returns { trade },
// now open. A trade following a strategy needs `ruleChecks`, { [ruleId]: met }
// for every rule. While a circuit breaker is tripped for the trade's mode, or a
// rule isn't met, answers 409 with { error, breakers?, unmetRules? } unless
// `override` is true; an overridden entry records the breakers it went past,
// and the checklist answers are saved either way.
export const POST = withErrorLogging('/api/trades/[id]/entry', async (request, { params }) => {
  const { id } = await params;
  // Postgres rejects a malformed uuid with an error; to the client it's just not found.
  if (!z.uuid().safeParse(id).success) return notFound();

  const trade = await getTrade(getDb(), id);
  if (!trade) return notFound();
  if (tradeStatus(trade) !== 'planned') return alreadyEntered();

  const body = await request.json().catch(() => null);
  const parsed = parseTradeEntry(body);
  // A deleted strategy unlinks its trades, so a trade without one has no checklist.
  const rules = trade.strategyId ? ((await getStrategy(getDb(), trade.strategyId))?.rules ?? []) : [];
  const checks = rules.length > 0 ? parseRuleChecks(body?.ruleChecks, rules) : { success: true, data: [] };
  if (!parsed.success || !checks.success) {
    return NextResponse.json(
      {
        error: 'Invalid entry',
        fieldErrors: {
          ...(parsed.success ? {} : z.flattenError(parsed.error).fieldErrors),
          ...(checks.success ? {} : z.flattenError(checks.error).fieldErrors),
        },
      },
      { status: 400 }
    );
  }

  const { settings, status } = await loadBreakerStatus(getDb());
  const tripped = settings.modes.includes(trade.mode) ? status.tripped : [];
  const unmet = unmetRules(checks.data);
  if ((tripped.length > 0 || unmet.length > 0) && body.override !== true) {
    return NextResponse.json(
      {
        error: tripped.length > 0 ? 'Circuit breaker tripped' : 'Checklist not met',
        ...(tripped.length > 0 && { breakers: tripped }),
        ...(unmet.length > 0 && { unmetRules: unmet }),
      },
      { status: 409 }
    );
  }

  // Null if another request recorded an entry since the check above.
  const updated = await recordEntry(getDb(), id, {
    ...parsed.data,
    overriddenBreakers: tripped.map((b) => b.breaker),
    ruleChecks: checks.data,
  });
  if (!updated) return alreadyEntered();

  return NextResponse.json({ trade: updated });
});
