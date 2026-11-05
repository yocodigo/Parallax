const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });

// How the setups backfill (scripts/backfill-setups.js) fetches minute bars for
// `trades` (each { symbol, assetClass, openedAt }): one fetch per symbol and New
// York day, running to the latest fill among its trades, which is safe since
// fourTouchAt reads nothing after each trade's own fill. Crypto needs no fetch:
// capture asks Alpaca's stock bars for it, finds none, and stores null setups.
// Returns { withoutBars, fetches: [{ symbol, end, trades }] }, fetches in the
// order their first trade comes.
export function backfillFetches(trades) {
  const withoutBars = trades.filter((t) => t.assetClass === 'crypto');
  const groups = new Map();
  for (const trade of trades) {
    if (trade.assetClass === 'crypto') continue;
    const key = `${trade.symbol} ${nyDate.format(trade.openedAt)}`;
    const group = groups.get(key) ?? { symbol: trade.symbol, end: trade.openedAt, trades: [] };
    if (trade.openedAt > group.end) group.end = trade.openedAt;
    group.trades.push(trade);
    groups.set(key, group);
  }
  return { withoutBars, fetches: [...groups.values()] };
}
