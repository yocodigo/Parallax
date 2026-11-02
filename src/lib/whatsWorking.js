import { MET } from './setups/gates';
import { profitLoss, rMultiple } from './tradeMetrics';

// [11] What's working: the trader's closed trades grouped by what went right
// (gates met, checklist rules followed, the setup that fired), each group with
// its average result, so the coach has positives to point at alongside the
// mistake ledger.
//
// A trade with an initial stop counts in R. One without (an option, exited by
// hand) counts in dollars of P/L instead, and the two are averaged apart,
// never mixed.

// The setups.md section 8 table's order, as TradeGates shows them.
const GATE_ORDER = ['window', 'size', 'direction', 'entry', 'location', 'stop', 'target', 'state'];

const average = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

// The trade's result as [unit, value]: R when it has one, else net P/L.
function resultOf(trade) {
  const r = rMultiple(trade);
  if (r !== null) return ['r', r];
  const pnl = profitLoss(trade);
  return pnl === null ? null : ['pnl', pnl];
}

// { trades, r: { trades, average } | null, pnl: { trades, average } | null }.
function summarize(results) {
  const of = (unit) => {
    const values = results.filter(([u]) => u === unit).map(([, value]) => value);
    return values.length ? { trades: values.length, average: average(values) } : null;
  };
  return { trades: results.length, r: of('r'), pnl: of('pnl') };
}

function push(map, key, result) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(result);
}

// `trades` are closed trades carrying `gates` (gradeTradeGates's result, or
// null), `ruleChecks` ({ ruleId, ruleText, met }), and `setups` (the names of
// the setups that fired on the entry). Returns { all, gates, rules, setups }:
// the baseline over every trade with a result, then per gate the trades that
// met it (in the section 8 order), per checklist rule the trades that followed
// it (most followed first; a deleted rule by its text, each named by its latest
// wording), and per setup the trades it fired on. Groups no trade is in are
// left out.
export function whatsWorking(trades) {
  const all = [];
  const byGate = new Map();
  const byRule = new Map();
  const bySetup = new Map();
  const latestWording = new Map();

  const counted = trades
    .map((trade) => ({ trade, result: resultOf(trade) }))
    .filter(({ result }) => result !== null)
    // Oldest first, so the rule wording kept is the latest.
    .sort((a, b) => a.trade.closedAt - b.trade.closedAt);

  for (const { trade, result } of counted) {
    all.push(result);
    for (const [gate, outcome] of Object.entries(trade.gates ?? {})) {
      if (outcome === MET) push(byGate, gate, result);
    }
    for (const { ruleId, ruleText: text, met } of trade.ruleChecks ?? []) {
      const key = ruleId ?? `text:${text}`;
      latestWording.set(key, { ruleId, ruleText: text });
      if (met) push(byRule, key, result);
    }
    for (const setup of trade.setups ?? []) push(bySetup, setup, result);
  }

  return {
    all: summarize(all),
    gates: GATE_ORDER.filter((gate) => byGate.has(gate)).map((gate) => ({ gate, met: summarize(byGate.get(gate)) })),
    rules: [...byRule.entries()]
      .map(([key, results]) => ({ ...latestWording.get(key), followed: summarize(results) }))
      .sort((a, b) => b.followed.trades - a.followed.trades),
    setups: [...bySetup.entries()]
      .map(([setup, results]) => ({ setup, fired: summarize(results) }))
      .sort((a, b) => a.setup.localeCompare(b.setup)),
  };
}
