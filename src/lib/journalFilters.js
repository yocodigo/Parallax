import { profitLoss, tradeStatus } from './tradeMetrics';

// The journal's filters, applied in the browser to the entries it already has.
// Each is 'all' or one choice; setup is 'all', 'none' (no strategy), or a
// strategy id.
export const NO_FILTERS = { mode: 'all', result: 'all', reviewed: 'all', setup: 'all' };

export const isFiltering = (filters) => Object.keys(NO_FILTERS).some((key) => filters[key] !== 'all');

// Win, loss, or scratch on gross P/L, in whole cents as on the performance
// page: fees would make almost no trade an exact scratch.
function resultOf(trade) {
  const gross = Math.round((profitLoss(trade) + (trade.fees ?? 0)) * 100);
  return gross > 0 ? 'win' : gross < 0 ? 'loss' : 'scratch';
}

// The entries that pass, trade by trade: a trade stays or goes with all of its
// entries, since "reviewed" reads every one of them. Result and reviewed apply
// to closed trades only (an open trade has neither yet), and any trade-only
// filter drops entries with no trade. Mode applies to both.
export function filterJournal(entries, filters) {
  const reviewed = new Set(entries.filter((e) => e.kind === 'review' && e.trade).map((e) => e.trade.id));

  return entries.filter((entry) => {
    const { trade } = entry;
    if (filters.mode !== 'all' && (trade?.mode ?? entry.mode) !== filters.mode) return false;
    if (filters.result === 'all' && filters.reviewed === 'all' && filters.setup === 'all') return true;
    if (!trade) return false;

    if (filters.setup === 'none' && trade.strategyId) return false;
    if (filters.setup !== 'all' && filters.setup !== 'none' && trade.strategyId !== filters.setup) return false;

    if (filters.result !== 'all' || filters.reviewed !== 'all') {
      if (tradeStatus(trade) !== 'closed') return false;
      if (filters.result !== 'all' && resultOf(trade) !== filters.result) return false;
      if (filters.reviewed === 'reviewed' && !reviewed.has(trade.id)) return false;
      if (filters.reviewed === 'unreviewed' && reviewed.has(trade.id)) return false;
    }
    return true;
  });
}
