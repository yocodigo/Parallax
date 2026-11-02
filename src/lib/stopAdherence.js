import { tradeBias, fillBarIndex } from './setups/replayTrades';
import { tradingDay } from './setups/session';
import { replayStops } from './setups/stopReplay';
import { DISCOMFORT_EXIT_REASONS } from './tradeFill';
import { tradeStatus } from './tradeMetrics';

// [11] Stop adherence: whether a closed trade's exit honored the stop rule
// chosen before entry (S1-S3, section 5), and how often that held over the
// trader's recent trades.

const MINUTE = 60_000;
const FIVE = 5 * MINUTE;
const MIN_TRADES = 5;
const RECENT_TRADES = 20;

const STOP_MISTAKES = ['moved_stop', 'held_past_stop'];

// When the trade's chosen rule would have exited, replayed on the
// underlying's 1m bars from the fill (stopReplay, section 5). Returns
// { triggeredAt } (a Date, or null when the rule never fires that session), or
// null when it can't be replayed: no stop rule, a trade not closed the session
// it was filled (the replay is intraday), no bar covering the fill, or S3
// without a T1 to time.
export function stopRuleTrigger(trade, bars, t1) {
  const { stopRule, openedAt, closedAt } = trade;
  if (!stopRule || !openedAt || !closedAt) return null;
  if (tradingDay({ t: closedAt.toISOString() }) !== tradingDay({ t: openedAt.toISOString() })) return null;
  if (stopRule === 'S3' && t1 == null) return null;
  const entryIndex = fillBarIndex(bars, openedAt);
  if (entryIndex === null) return null;

  // T1 only matters to S3; for S1 and S2 the replay runs to the rule or the
  // close rather than stopping at T1.
  const result = replayStops({
    bars,
    entryIndex,
    bias: tradeBias(trade),
    t1: stopRule === 'S3' ? t1 : null,
    rules: [stopRule],
  });
  if (result.reason !== stopRule) return { triggeredAt: null };
  const start = Date.parse(bars[result.exitIndex].t);
  // S1 fires on a 5m close. The replay points its exit at a 1m bar inside that
  // 5m period (the last one before a gap in the feed, if the period ended in
  // one), so the rule fired at the period's clock-aligned end, not that bar's.
  if (stopRule === 'S1') return { triggeredAt: new Date(Math.floor(start / FIVE) * FIVE + FIVE) };
  return { triggeredAt: new Date(start + MINUTE) };
}

// One closed trade, judged: { result: 'adherent' | 'miss' | 'unknown', reason },
// or null when it doesn't count (no stop rule chosen, or not closed). `mistakes`
// are the tags on any of the trade's entries; `replay` is stopRuleTrigger's
// result. Checked in order:
// - a moved_stop or held_past_stop tag is a miss, whatever the exit;
// - an invalidation exit (the planned stop rule hit) is adherent;
// - a discomfort exit (tier 3-4) is a miss when the rule hadn't fired by then,
//   including when it never would have that session, and adherent once it had;
// - any other planned exit (tier 1-2) is adherent;
// - no exit reason, or a discomfort exit that couldn't be replayed, is unknown.
export function judgeStopAdherence(trade, mistakes = [], replay = null) {
  if (!trade.stopRule || tradeStatus(trade) !== 'closed') return null;
  if (mistakes.some((mistake) => STOP_MISTAKES.includes(mistake))) return { result: 'miss', reason: 'mistake' };
  if (!trade.exitReason) return { result: 'unknown', reason: 'no_exit_reason' };
  if (trade.exitReason === 'invalidation') return { result: 'adherent', reason: 'invalidation' };
  if (!DISCOMFORT_EXIT_REASONS.includes(trade.exitReason)) return { result: 'adherent', reason: 'plan_exit' };

  if (!replay) return { result: 'unknown', reason: 'not_replayed' };
  const { triggeredAt } = replay;
  if (triggeredAt === null || trade.closedAt.getTime() < triggeredAt.getTime()) {
    return { result: 'miss', reason: 'discomfort_before_rule' };
  }
  return { result: 'adherent', reason: 'after_rule' };
}

// The adherence rate over the RECENT_TRADES most recent judged trades
// ({ closedAt, result }), the way historyWarnings reads recent history; null
// with fewer than MIN_TRADES of them. Unknowns are left out. Returns
// { rate, adherent, misses, trades }.
export function adherenceRate(judged) {
  const recent = judged
    .filter(({ result }) => result === 'adherent' || result === 'miss')
    .sort((a, b) => b.closedAt - a.closedAt)
    .slice(0, RECENT_TRADES);
  if (recent.length < MIN_TRADES) return null;
  const adherent = recent.filter(({ result }) => result === 'adherent').length;
  return { rate: adherent / recent.length, adherent, misses: recent.length - adherent, trades: recent.length };
}
