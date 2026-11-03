import { describe, expect, it } from 'vitest';
import { DEMO_DAILY_PLANS, DEMO_REVIEWS, DEMO_STRATEGY, DEMO_THESES, DEMO_TRADES } from '../demoSeed';
import { formatProfitLoss, formatR } from '../format';
import { parseJournalEntry } from '../journalEntry';
import { parseTradePlan } from '../tradePlan';
import { parseTradeEntry, parseTradeExit } from '../tradeFill';
import { profitLoss, rMultiple } from '../tradeMetrics';

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

  it('has fills and exits the entry and exit forms would accept', () => {
    for (const { plan, entry, exit } of DEMO_TRADES) {
      if (!entry) continue;
      expect(parseTradeEntry(entry).success, `${plan.symbol} entry`).toBe(true);
      expect(parseTradeExit(exit, entry).success, `${plan.symbol} exit`).toBe(true);
    }
  });

  it('quotes in each day\'s coaching the R or P/L the journal shows for its trades', () => {
    for (const { plan, entry, exit } of DEMO_TRADES) {
      if (!exit) continue;
      const trade = { multiplier: 1, ...plan, ...entry, ...exit };
      const r = rMultiple(trade);
      const shown = r === null ? formatProfitLoss(profitLoss(trade)) : formatR(r);
      const day = exit.closedAt.toISOString().slice(0, 10);
      const review = DEMO_REVIEWS.find((it) => it.createdAt.toISOString().startsWith(day));
      expect(review.coaching, `${plan.symbol} on ${day}`).toContain(shown);
    }
  });

  it('gives the exit review a T1 above the fill on the day it plans', () => {
    for (const { tradeDate, ltfFib50, ltfFib100 } of DEMO_DAILY_PLANS) {
      const trades = DEMO_TRADES.filter(({ entry }) => entry?.openedAt.toISOString().startsWith(tradeDate));
      expect(new Set(trades.map(({ plan }) => plan.symbol)).size).toBe(1);
      for (const { plan, entry } of trades) {
        expect(plan.direction).toBe('long');
        expect(ltfFib50).toBeGreaterThan(entry.entryPrice);
        expect(ltfFib100).toBeGreaterThan(ltfFib50);
      }
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

  it('names only real checklist rules as unmet, and has a trade entered anyway', () => {
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
