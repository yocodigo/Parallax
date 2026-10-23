import { rMultiple } from './tradeMetrics';

const average = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

const summary = (rs) => ({ trades: rs.length, totalR: rs.reduce((sum, r) => sum + r, 0), averageR: average(rs) });

// Whether following the entry checklist pays. `trades` carry `ruleChecks`
// ({ ruleId, ruleText, met }), oldest first. Only closed trades with an R and
// at least one check count.
//
// Returns { followed, broken, rules, trades }: the trades with every rule met
// against those entered with one or more unmet; per rule, how often it was
// skipped and the average R when skipped and when met, most skipped first;
// and how many trades were counted.
export function checklistReport(trades) {
  const followedRs = [];
  const brokenRs = [];
  const byRule = new Map();

  for (const trade of trades) {
    const r = rMultiple(trade);
    if (r === null || trade.ruleChecks.length === 0) continue;

    (trade.ruleChecks.every((c) => c.met) ? followedRs : brokenRs).push(r);

    for (const { ruleId, ruleText, met } of trade.ruleChecks) {
      // A deleted rule has lost its id; its copied text still tells it apart.
      const key = ruleId ?? `text:${ruleText}`;
      if (!byRule.has(key)) byRule.set(key, { ruleId, metRs: [], skippedRs: [] });
      const rule = byRule.get(key);
      // Oldest first, so the wording kept is the latest.
      rule.ruleText = ruleText;
      (met ? rule.metRs : rule.skippedRs).push(r);
    }
  }

  const rules = [...byRule.values()]
    .map(({ ruleId, ruleText, metRs, skippedRs }) => ({
      ruleId,
      ruleText,
      checked: metRs.length + skippedRs.length,
      skipped: skippedRs.length,
      skippedAverageR: average(skippedRs),
      metAverageR: average(metRs),
    }))
    .sort((a, b) => b.skipped - a.skipped);

  return {
    followed: summary(followedRs),
    broken: summary(brokenRs),
    rules,
    trades: followedRs.length + brokenRs.length,
  };
}
