// Metrics are computed from a trade's stored facts, never stored themselves.

const sign = (trade) => (trade.direction === 'long' ? 1 : -1);
const isSet = (value) => value !== null && value !== undefined;

// opened_at marks the entry fill and closed_at the exit.
export function tradeStatus(trade) {
  if (trade.closedAt) return 'closed';
  if (trade.openedAt) return 'open';
  return 'planned';
}

// Net of fees, in dollars. For options, prices are premiums per share, so the
// multiplier (usually 100) turns them into dollars per contract.
export function profitLoss(trade) {
  if (tradeStatus(trade) !== 'closed' || !isSet(trade.entryPrice) || !isSet(trade.exitPrice)) {
    return null;
  }
  const gross = (trade.exitPrice - trade.entryPrice) * sign(trade) * trade.quantity * trade.multiplier;
  return gross - (trade.fees ?? 0);
}

// What the trade stood to lose at the initial stop, in dollars: 1R. Measured
// from the actual fill once there is one, from the planned entry before that.
export function initialRisk(trade) {
  const entry = trade.entryPrice ?? trade.plannedEntry;
  if (!isSet(trade.initialStop) || !isSet(entry)) return null;
  return Math.abs(entry - trade.initialStop) * trade.quantity * trade.multiplier;
}

// The result in units of initial risk: +2 made twice what was risked, -1 lost
// exactly the planned amount. Fees count against it.
export function rMultiple(trade) {
  const pnl = profitLoss(trade);
  const risk = initialRisk(trade);
  if (pnl === null || !risk) return null;
  return pnl / risk;
}
