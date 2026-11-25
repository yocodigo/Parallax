import { nyDay } from './setups/session';
import { todaySummary } from './today';

// The journal list grouped by New York day, newest first. A trade's entries
// (plan, reviews) fold into one row, filed under the day it was opened, or the
// day its first entry was written when it was never filled. An entry with no
// trade is its own row on the day it was written. Rows within a day are newest
// first by that same moment (`at`). Entries need `tradeId` as well as `trade`
// (`todaySummary` matches reviews by it), and `mode` isn't looked at, so a
// caller that filters by mode does it before grouping.
export function journalDays(entries) {
  const tradeRows = new Map();
  const items = [];

  for (const entry of entries) {
    if (!entry.trade) {
      items.push({ type: 'entry', entry, at: new Date(entry.createdAt) });
      continue;
    }
    let row = tradeRows.get(entry.trade.id);
    if (!row) {
      row = { type: 'trade', trade: entry.trade, entries: [], at: null };
      tradeRows.set(entry.trade.id, row);
      items.push(row);
    }
    row.entries.push(entry);
  }

  for (const row of tradeRows.values()) {
    const written = row.entries.map((entry) => new Date(entry.createdAt).getTime());
    row.at = row.trade.openedAt ? new Date(row.trade.openedAt) : new Date(Math.min(...written));
  }

  const byDay = new Map();
  for (const item of items.sort((a, b) => b.at - a.at)) {
    const day = nyDay(item.at);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(item);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, dayItems]) => {
      const rows = dayItems.filter((item) => item.type === 'trade');
      const { tradeCount, closedCount, netPnl, reviewed } = todaySummary({
        plans: [],
        trades: rows.map((row) => row.trade),
        reviews: rows.flatMap((row) => row.entries.filter((entry) => entry.kind === 'review')),
      });
      return { day, items: dayItems, summary: { tradeCount, closedCount, netPnl, reviewed } };
    });
}
