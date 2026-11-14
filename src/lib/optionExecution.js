import { summarize } from './performance';
import { holdMinutes, profitLoss } from './tradeMetrics';

// What the fills say about how option trades were executed (rules-v3 section
// 8): hold time, exits with no trigger, friction, and the premium band. All
// over closed option trades, whose entry time and prices are stored.

// Closed option trades with a P/L and an entry time to hold from.
const countedOptions = (trades) =>
  trades.filter((trade) => trade.assetClass === 'option' && profitLoss(trade) !== null && holdMinutes(trade) !== null);

// [8.1] Hold buckets in minutes, each from its lower edge up to the next.
const HOLD_BUCKETS = [
  { key: 'under1', label: 'Under 1 min', from: 0, to: 1 },
  { key: '1to3', label: '1–3 min', from: 1, to: 3 },
  { key: '3to5', label: '3–5 min', from: 3, to: 5 },
  { key: '5to15', label: '5–15 min', from: 5, to: 15 },
  { key: '15plus', label: '15+ min', from: 15, to: Infinity },
];

// [8.1] Hold time: trades, win rate (gross), and net P/L by how long each
// option trade was held. Every bucket is always there, empty ones with a null
// win rate.
export function holdTime(trades) {
  const options = countedOptions(trades);
  return HOLD_BUCKETS.map(({ key, label, from, to }) => {
    const inBucket = options.filter((trade) => holdMinutes(trade) >= from && holdMinutes(trade) < to);
    const { winRate, netPnl } = summarize(inBucket);
    return { key, label, trades: inBucket.length, winRate, netPnl };
  });
}
