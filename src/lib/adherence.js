import { profitLoss, tradeStatus } from './tradeMetrics';
import { MET, MISSED, sizeGate, windowGate } from './setups/gates';

// Rule adherence over closed trades (docs/private/dashboard.md section 3): how
// many entries held the Window OK and Size OK gates, and what the ones that
// broke them cost. The gates are the review-time ones in setups/gates.js; a
// trade a gate can't judge (no entry time) counts toward neither side.
// `cost` is the net P/L of the trades that missed, so a costly rule is negative.
// Plan OK, Stop OK, Exit OK, and a discipline score aren't defined yet.

const toCents = (dollars) => Math.round(dollars * 100);

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

export function adherence(trades) {
  const rows = trades
    .filter((trade) => tradeStatus(trade) === 'closed' && profitLoss(trade) !== null)
    .map((trade) => ({ trade, net: toCents(profitLoss(trade)) }));

  return {
    trades: rows.length,
    window: tally(rows, (trade) => windowGate(trade.openedAt && new Date(trade.openedAt))),
    size: tally(rows, (trade) => sizeGate(trade.quantity)),
  };
}
