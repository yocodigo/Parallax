import { describe, expect, it } from 'vitest';
import { DEMO_REVIEWS, DEMO_STRATEGY, DEMO_THESES, DEMO_TRADES } from '../demoSeed';
import { parseJournalEntry } from '../journalEntry';
import { parseTradePlan } from '../tradePlan';
import { profitLoss } from '../tradeMetrics';

// The regular session in late October 2026 (New York on daylight time).
const inSession = (date) => {
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return date.getUTCDay() >= 1 && date.getUTCDay() <= 5 && minutes >= 13 * 60 + 30 && minutes < 20 * 60;
};

describe('the demo dataset', () => {
  it('has plans the app itself would accept', () => {
    for (const { plan, planEntry } of DEMO_TRADES) {
      expect(parseTradePlan(plan).success, `${plan.symbol} plan`).toBe(true);
      expect(parseJournalEntry({ ...planEntry, kind: 'plan' }).success, `${plan.symbol} entry`).toBe(true);
    }
  });

  it('has reviews and theses the app would accept', () => {
    for (const review of DEMO_REVIEWS) {
      expect(parseJournalEntry({ ...review, kind: 'review' }).success).toBe(true);
    }
    for (const thesis of DEMO_THESES) {
      expect(parseJournalEntry({ ...thesis, kind: 'thesis' }).success).toBe(true);
    }
  });

  it('fills during the regular session, plans before entries, exits after', () => {
    for (const { plan, planEntry, entry, exit } of DEMO_TRADES) {
      if (!entry) continue;
      expect(inSession(entry.openedAt), `${plan.symbol} entry`).toBe(true);
      expect(planEntry.createdAt <= entry.openedAt).toBe(true);
      expect(inSession(exit.closedAt), `${plan.symbol} exit`).toBe(true);
      expect(exit.closedAt > entry.openedAt).toBe(true);
    }
  });

  it('answers every checklist rule for the trades that follow the strategy', () => {
    const ruleCount = DEMO_STRATEGY.rules.length;
    for (const { followsStrategy, entry } of DEMO_TRADES) {
      if (!followsStrategy || !entry) continue;
      for (const index of entry.unmetRules) expect(index).toBeLessThan(ruleCount);
    }
    expect(DEMO_TRADES.some((trade) => trade.entry?.unmetRules.length > 0)).toBe(true);
  });

  it('has winners, losers, options without stops, and one plan never filled', () => {
    const pnls = DEMO_TRADES.filter((trade) => trade.exit).map((trade) =>
      profitLoss({ multiplier: 1, ...trade.plan, ...trade.entry, ...trade.exit })
    );
    expect(pnls.some((pnl) => pnl > 0)).toBe(true);
    expect(pnls.some((pnl) => pnl < 0)).toBe(true);
    expect(DEMO_TRADES.some(({ plan }) => plan.assetClass === 'option' && plan.initialStop === undefined)).toBe(true);
    expect(DEMO_TRADES.filter((trade) => !trade.entry)).toHaveLength(1);
  });

  it('links each review to a closed trade and writes it after that trade closed', () => {
    for (const review of DEMO_REVIEWS) {
      const trade = DEMO_TRADES[review.tradeIndex];
      expect(trade.exit).toBeDefined();
      expect(review.createdAt >= trade.exit.closedAt).toBe(true);
      expect(review.coaching.length).toBeGreaterThan(0);
    }
  });
});
