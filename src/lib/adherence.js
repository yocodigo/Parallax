import { profitLoss } from './tradeMetrics';
import { MET, MISSED, UNKNOWN, sizeGate, windowGate } from './setups/gates';

// Rule adherence over closed trades (docs/private/dashboard.md section 3): how
// many entries held the Window OK and Size OK gates, and what the ones that
// broke them cost. The gates are the review-time ones in setups/gates.js; a
// trade a gate can't judge (no entry time) counts toward neither side.
// `cost` is the net P/L of the trades that missed, so a costly rule is negative.
// Option trades only: the gates count contracts, and a stock's share count
// would read as an oversized entry.
// Plan OK, from the facts the route adds to each trade (`planFacts`): a plan
// entry written before the fill, a strategy picked, and no checklist rule
// entered unmet. Stop OK, Exit OK, and a discipline score aren't defined yet.

// Money is summed in whole cents so totals don't drift with floating-point error.
const toCents = (dollars) => Math.round(dollars * 100);

// Plan OK. `trade.planWrittenAt` is the earliest plan entry's creation time and
// `trade.unmetRuleCount` the checklist rules answered unmet (the entry went
// ahead by override). Without an entry time there is no "before the fill".
export function planGate(trade) {
  if (!trade.openedAt) return UNKNOWN;
  const planned = trade.planWrittenAt && new Date(trade.planWrittenAt) < new Date(trade.openedAt);
  return planned && trade.strategyId && !trade.unmetRuleCount ? MET : MISSED;
}

function tally(rows, grade) {
  const tallied = { ok: 0, missed: 0, cost: 0 };
  let cents = 0;
  for (const { trade, net } of rows) {
    const result = grade(trade);
    if (result === MET) tallied.ok += 1;
    if (result === MISSED) {
      tallied.missed += 1;
      cents += net;
    }
  }
  return { ...tallied, cost: cents / 100 };
}

// Option trades closed with a P/L, with the net in cents.
function pricedOptionRows(trades) {
  // profitLoss is null until the trade is closed with both prices.
  return trades
    .filter((trade) => trade.assetClass === 'option')
    .map((trade) => ({ trade, pnl: profitLoss(trade) }))
    .filter(({ pnl }) => pnl !== null)
    .map(({ trade, pnl }) => ({ trade, net: toCents(pnl) }));
}

export function adherence(trades) {
  const rows = pricedOptionRows(trades);

  return {
    trades: rows.length,
    window: tally(rows, (trade) => windowGate(trade.openedAt && new Date(trade.openedAt))),
    size: tally(rows, (trade) => sizeGate(trade.quantity)),
    plan: tally(rows, planGate),
  };
}

// Which bucket of `violationCosts` a trade falls in. `window` means the
// lockout gate (Window OK) was missed.
function violationBucket(windowMissed, sizeMissed) {
  if (windowMissed && sizeMissed) return 'both';
  if (windowMissed) return 'window';
  if (sizeMissed) return 'size';
  return 'followed';
}

// Net P/L by which rules the entry broke, for the mistake cost ledger chart
// (dashboard.md section 4, chart 1). Unlike `adherence`, each trade lands in
// exactly one bucket, so the buckets add up to the total: `followed` (neither
// gate missed; a gate that can't judge counts as not missed), `window` (the
// lockout only), `size` (the size only), or `both`.
export function violationCosts(trades) {
  const buckets = {
    followed: { trades: 0, cents: 0 },
    window: { trades: 0, cents: 0 },
    size: { trades: 0, cents: 0 },
    both: { trades: 0, cents: 0 },
  };
  for (const { trade, net } of pricedOptionRows(trades)) {
    const windowMissed = windowGate(trade.openedAt && new Date(trade.openedAt)) === MISSED;
    const sizeMissed = sizeGate(trade.quantity) === MISSED;
    const bucket = buckets[violationBucket(windowMissed, sizeMissed)];
    bucket.trades += 1;
    bucket.cents += net;
  }
  return Object.fromEntries(
    Object.entries(buckets).map(([key, { trades: count, cents }]) => [key, { trades: count, net: cents / 100 }])
  );
}
