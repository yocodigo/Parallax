import { atLeast, atMost } from './setups/compare';

const roundTo = (value, places) => Number(value.toFixed(places));

// What the option rules say about a plan being written (rules-v3 section 9),
// from the saved rule settings: the backstop premium (the planned premium less
// `backstopPct`), the dollars at risk if the backstop fills (premium x pct x
// 100 x contracts, section 1.1), and warnings. Warnings never block a plan.
// The risk figure shows even while no risk per trade is set; only a set limit
// can be exceeded.
export function planGuidance({ plannedEntry, quantity }, rules) {
  const hasPremium = Number.isFinite(plannedEntry) && plannedEntry > 0;
  const warnings = [];

  if (hasPremium && rules.premiumBandOn) {
    if (!atLeast(plannedEntry, rules.premiumMin)) {
      warnings.push(`Premium is under the band's minimum of $${rules.premiumMin.toFixed(2)}.`);
    } else if (rules.premiumMax != null && !atMost(plannedEntry, rules.premiumMax)) {
      warnings.push(`Premium is over the band's maximum of $${rules.premiumMax.toFixed(2)}.`);
    }
  }

  const backstop = hasPremium && rules.backstopOn ? roundTo(plannedEntry * (1 - rules.backstopPct), 2) : null;

  const hasQuantity = Number.isFinite(quantity) && quantity > 0;
  const riskAtBackstop =
    hasPremium && hasQuantity && rules.backstopOn
      ? roundTo(plannedEntry * rules.backstopPct * 100 * quantity, 2)
      : null;

  if (riskAtBackstop !== null && rules.riskPerTrade != null && !atMost(riskAtBackstop, rules.riskPerTrade)) {
    warnings.push(
      `The backstop risks $${riskAtBackstop.toFixed(0)}, over the $${rules.riskPerTrade} risk per trade.`
    );
  }

  return { backstop, riskAtBackstop, warnings };
}
