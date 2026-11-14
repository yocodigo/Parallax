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

// Premiums are decimals, so a sale at exactly the backstop level can land a
// hair above it.
const PRICE_TOLERANCE = 1e-9;

// [8.2] Exits with no trigger. Only the backstop and the time stop count as
// triggers for now: a sale at or under the backstop level (the entry premium
// less `backstopPct`), or a hold of `timeStopMinutes` or more. Everything else
// was nobody's rule. A trigger whose rule is off isn't counted. `rules` is the
// stored rule settings. Returns the trades split into triggered and untriggered
// with their net P/L, and the untriggered share (null without trades).
export function untriggeredExits(trades, rules) {
  const options = countedOptions(trades);
  const isTriggered = (trade) => {
    const backstop =
      rules.backstopOn && trade.exitPrice <= trade.entryPrice * (1 - rules.backstopPct) + PRICE_TOLERANCE;
    const time = rules.timeStopOn && holdMinutes(trade) >= rules.timeStopMinutes;
    return backstop || time;
  };

  const triggered = options.filter(isTriggered);
  const untriggered = options.filter((trade) => !isTriggered(trade));
  return {
    trades: options.length,
    triggered: { trades: triggered.length, netPnl: summarize(triggered).netPnl },
    untriggered: { trades: untriggered.length, netPnl: summarize(untriggered).netPnl },
    untriggeredShare: options.length ? untriggered.length / options.length : null,
  };
}
