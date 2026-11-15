import { percentiles } from './percentiles';
import { edgeSplit } from './tradeWindow';
import { profitLoss } from './tradeMetrics';

// [rules-v3 8.8] Heat on winners: for an option trade that ended a win, the
// worst move against it before it worked. Measured on the contract's premium
// and on the underlying (structure R), so the stop that keeps most winners can
// be read off the spread instead of chosen by feel. Computed on demand, never
// stored.

const MINUTE = 60_000;
const minuteOf = (date) => Math.floor(date.getTime() / MINUTE) * MINUTE;

// Premium against the trade, per share and in dollars and as a share of the
// premium paid. A bought contract is hurt by a lower premium, a sold one by a
// higher one. Zero, never negative, when it never went against the fill.
function measure(trade, bars) {
  const worst = trade.direction === 'long' ? Math.min(...bars.map((b) => b.l)) : Math.max(...bars.map((b) => b.h));
  const perShare = Math.max(0, trade.direction === 'long' ? trade.entryPrice - worst : worst - trade.entryPrice);
  return {
    perShare,
    dollars: perShare * trade.multiplier * trade.quantity,
    percent: perShare / trade.entryPrice,
  };
}

// Premium heat from the contract's own minute bars, which exist only for
// minutes with a trade. Reads the minutes from the fill's to the exit's.
// Returns { source: 'bars', perShare, dollars, percent, barCoverage (the share
// of those minutes that had a bar), edgeMinutesOnly, between } or null without
// a bar there. A trade held under two minutes is flagged, since its fill and
// exit minutes hold premiums from before the fill and after the exit, and is
// also measured on the bars strictly between them (`between`, null when there
// are none).
export function premiumHeat(trade, bars) {
  const from = minuteOf(trade.openedAt);
  const to = minuteOf(trade.closedAt);
  const inWindow = bars.filter((bar) => Date.parse(bar.t) >= from && Date.parse(bar.t) <= to);
  if (inWindow.length === 0) return null;

  const minutes = (to - from) / MINUTE + 1;
  const { edgeMinutesOnly, between } = edgeSplit(inWindow, trade.openedAt, trade.closedAt);
  return {
    source: 'bars',
    ...measure(trade, inWindow),
    barCoverage: new Set(inWindow.map((bar) => bar.t)).size / minutes,
    edgeMinutesOnly,
    between: edgeMinutesOnly && between.length > 0 ? measure(trade, between) : null,
  };
}

// Premium heat estimated from the delta stored with the trade's context and
// the underlying's move against it (`underlyingMae`, in points): about
// |delta| × the move, per share. Labelled by its source; null without either.
export function premiumFromDelta(trade, delta, underlyingMae) {
  if (delta === null || delta === undefined || underlyingMae === null || underlyingMae === undefined) return null;
  const perShare = Math.abs(delta) * underlyingMae;
  return {
    source: 'delta',
    perShare,
    dollars: perShare * trade.multiplier * trade.quantity,
    percent: perShare / trade.entryPrice,
    barCoverage: null,
  };
}

// Closed for a gross win, as wins are judged everywhere (in whole cents, so a
// round trip at the same premium is a scratch).
export function isWinner(trade) {
  const pnl = profitLoss(trade);
  return pnl !== null && Math.round((pnl + (trade.fees ?? 0)) * 100) > 0;
}

// A closed option trade's heat, if it ended a win (gross P/L above zero, as
// wins are judged everywhere): { premium, underlying }. `optionBars` are the
// contract's minute bars, `delta` the stored one (or null), and `underlying`
// underlyingExcursions' result (or null). The premium comes from the bars, else
// from the delta, else `{ source: 'none' }`: never an assumed delta.
export function winnerHeat(trade, { optionBars, delta, underlying }) {
  if (!isWinner(trade)) return null;
  const premium = premiumHeat(trade, optionBars) ??
    premiumFromDelta(trade, delta, underlying?.mae ?? null) ?? { source: 'none' };
  return { premium, underlying };
}

// Premium heat is banded in steps of this share of the premium, up to
// HEAT_BANDS of them, the last open-ended (`to` null).
export const HEAT_BAND = 0.05;
const HEAT_BANDS = 10;

// Why a winner's premium heat isn't in the trusted set.
function exclusion(premium) {
  if (premium.source === 'none') return 'none';
  if (premium.source === 'delta') return 'delta';
  if (premium.barCoverage < 1) return 'partialCoverage';
  if (premium.edgeMinutesOnly) return 'edgeMinutesOnly';
  return null;
}

// The heat view's figures from winnerHeat rows. Premium heat (as a share of
// the premium paid) is the trusted set by default: the contract's own bars,
// every minute of the window covered, and not mostly edge minutes. The rest
// are counted by reason in `excluded`; `includeAll` takes in every row with a
// premium figure (partial coverage, edge minutes, and delta estimates) and
// leaves out only those with none. The underlying's heat is in R, kept apart
// by where the stop came from (a planned and a derived stop are never pooled),
// and in points for every trade measured, stop or not.
export function heatSummary(rows, { includeAll = false } = {}) {
  const excluded = { partialCoverage: 0, edgeMinutesOnly: 0, delta: 0, none: 0 };
  const premiums = [];
  for (const { premium } of rows) {
    const reason = exclusion(premium);
    if (reason === null || (includeAll && reason !== 'none')) premiums.push(premium.percent);
    else excluded[reason] += 1;
  }

  const bands = Array.from({ length: HEAT_BANDS }, (_, k) => {
    const from = Math.round(k * HEAT_BAND * 100) / 100;
    const to = k === HEAT_BANDS - 1 ? null : Math.round((k + 1) * HEAT_BAND * 100) / 100;
    return { from, to, trades: premiums.filter((p) => p >= from && (to === null || p < to)).length };
  });

  const underlying = rows.map((row) => row.underlying).filter(Boolean);
  const rBySource = (source) => {
    const values = underlying.filter((u) => u.stopSource === source && u.maeR !== null).map((u) => u.maeR);
    return { trades: values.length, percentiles: percentiles(values) };
  };
  const points = underlying.map((u) => u.mae);

  return {
    winners: rows.length,
    premium: { trades: premiums.length, excluded, bands, percentiles: percentiles(premiums) },
    underlying: {
      r: { plan: rBySource('plan'), derived: rBySource('derived') },
      points: { trades: points.length, percentiles: percentiles(points) },
    },
  };
}
