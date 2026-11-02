// [10] A closed trade's exit review, after the fact: the reaction at T1
// (setups.md 3.1 step 5) and whether the exit matched what step 5 says to do.
// Pure: the caller fetches the underlying's minute bars (session bars, oldest
// first, Alpaca's keys) through the end of the fill's session, and the day's
// plan row.
//
// Unlike the entry review this deliberately reads bars after the exit: what
// price did at T1 is graded separately from when the trade was taken
// (section 1). The verdict has hindsight on purpose: it compares the exit's
// time with when step 5's call was decided, whether or not the exit could
// have known it then.

import { reactionAt } from './reaction';
import { tradeBias } from './replayTrades';
import { lastClosedBy } from './room';
import { tradingDay } from './session';
import { underlyingAt } from './tradeGates';

const MINUTE = 60_000;

const closeOf = (bar) => Date.parse(bar.t) + MINUTE;

const skipped = (bias, reason) => ({
  bias,
  t1: null,
  t2: null,
  skipped: reason,
  reaction: null,
  exitUnderlying: null,
  verdict: null,
});

// What step 5 says to do against what the trade did, by timing alone. One
// exit per trade is all that is recorded, so an oscillation's "close one
// contract" can't be told from any other exit and isn't judged.
//
// - 'before_t1': the exit came before the touch bar had closed.
// - 'matched' / 'early': a rejection says close, so an exit once it was
//   decided matches and one before it is early; a rip says hold toward T2, so
//   an exit once a bar had reached T2 matches and one before is early.
//   'matched' means not early: an exit hours after a rejection still matches,
//   since timing alone can't show the trader acted on the signal.
// - 'not_judged': oscillating. 'no_rule': nothing was decided within the
//   window. 'not_decided': the bars ended before the reaction was.
function judge(bars, reaction, t2, bias, exitIndex, exitTime) {
  if (reaction.touchIndex > exitIndex) return 'before_t1';
  switch (reaction.kind) {
    case 'rejected':
      return exitTime >= closeOf(bars[reaction.decidedAt]) ? 'matched' : 'early';
    case 'ripped': {
      const reachedT2 = bars
        .slice(reaction.touchIndex, exitIndex + 1)
        .some((bar) => (bias === 'long' ? bar.h >= t2 : bar.l <= t2));
      return reachedT2 ? 'matched' : 'early';
    }
    case 'oscillating':
      return 'not_judged';
    case 'none':
      return 'no_rule';
    default:
      return 'not_decided';
  }
}

// The review of `trade` (a trades row) from `bars` and `dailyPlan` (the fill
// day's plan row, or null). Returns null for a trade that isn't closed;
// otherwise { bias, t1, t2, skipped, reaction, exitUnderlying, verdict }. T1 is
// the working fib's 50% and T2 its 100%, used only when T1 sits on the trade's
// side of the fill. `skipped` says why there is no reaction or verdict
// ('not_intraday', 'no_daily_plan', 'no_bars', 'fib_not_on_trade_side');
// `reaction` is { kind, touchAt, decidedAt, drifting? } or null when price
// never touched T1.
export function reviewExit(trade, bars = [], dailyPlan = null) {
  if (!trade.closedAt || !trade.openedAt) return null;
  const bias = tradeBias(trade);
  const day = tradingDay({ t: trade.openedAt.toISOString() });
  // Step 5 is an intraday call; a trade held past the session closed on
  // another day's reasons.
  if (tradingDay({ t: trade.closedAt.toISOString() }) !== day) return skipped(bias, 'not_intraday');
  if (!dailyPlan) return skipped(bias, 'no_daily_plan');

  // Bars through the fill's session only, so the 14-bar ATR doesn't read into
  // a later day across the overnight gap.
  const end = bars.findLastIndex((bar) => tradingDay(bar) === day);
  const session = bars.slice(0, end + 1);
  const from = session.findIndex((bar) => closeOf(bar) > trade.openedAt.getTime());
  const entryPrice = underlyingAt(bars, trade.openedAt, day);
  if (from < 0 || entryPrice === null) return skipped(bias, 'no_bars');

  // The side-of-fill check stands in for the plan's `ltfDirection`: a fib is a
  // target only when its 50% is ahead of the fill.
  const { ltfFib50: t1, ltfFib100: t2 } = dailyPlan;
  if (bias === 'long' ? t1 <= entryPrice : t1 >= entryPrice) return skipped(bias, 'fib_not_on_trade_side');

  // A trade closes at or after its fill, so the bar that gave `entryPrice` had
  // closed by the exit and `exitIndex` is at least that bar's.
  const exitTime = trade.closedAt.getTime();
  const exitIndex = lastClosedBy(session, exitTime);
  const found = reactionAt(session, t1, bias, from, session.length - 1);
  const reaction = found && {
    kind: found.kind,
    touchAt: session[found.touchIndex].t,
    decidedAt: found.decidedAt === undefined ? null : session[found.decidedAt].t,
    ...(found.drifting === undefined ? {} : { drifting: found.drifting }),
  };

  return {
    bias,
    t1,
    t2,
    skipped: null,
    reaction,
    exitUnderlying: session[exitIndex].c,
    verdict: found ? judge(session, found, t2, bias, exitIndex, exitTime) : 'not_reached',
  };
}
