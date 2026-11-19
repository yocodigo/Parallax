import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SETTINGS } from '../ruleSettings';
import { planGuidance } from '../planGuidance';

const rules = (overrides = {}) => ({ ...DEFAULT_RULE_SETTINGS, premiumMax: 3, ...overrides });

describe('planGuidance', () => {
  it('prefills the backstop at the saved share under the planned premium', () => {
    const { backstop } = planGuidance({ plannedEntry: 1.2, quantity: 2 }, rules({ backstopPct: 0.25 }));

    expect(backstop).toBe(0.9);
  });

  it('has no backstop when the rule is off or there is no premium yet', () => {
    expect(planGuidance({ plannedEntry: 1.2, quantity: 1 }, rules({ backstopOn: false })).backstop).toBeNull();
    expect(planGuidance({ quantity: 1 }, rules()).backstop).toBeNull();
  });

  it('warns when the premium is outside the saved band', () => {
    const under = planGuidance({ plannedEntry: 0.3, quantity: 1 }, rules({ premiumMin: 0.5 }));
    const over = planGuidance({ plannedEntry: 3.5, quantity: 1 }, rules());

    expect(under.warnings).toEqual([expect.stringContaining('under')]);
    expect(over.warnings).toEqual([expect.stringContaining('over')]);
  });

  it('stays quiet inside the band and when the band is off', () => {
    expect(planGuidance({ plannedEntry: 1, quantity: 1 }, rules()).warnings).toEqual([]);
    expect(planGuidance({ plannedEntry: 0.1, quantity: 1 }, rules({ premiumBandOn: false })).warnings).toEqual([]);
  });

  it('warns when the dollars at the backstop pass the risk per trade', () => {
    // 1.20 premium x 25% x 100 x 2 contracts = $60 at the backstop.
    const { riskAtBackstop, warnings } = planGuidance(
      { plannedEntry: 1.2, quantity: 2 },
      rules({ riskPerTrade: 50 })
    );

    expect(riskAtBackstop).toBe(60);
    expect(warnings).toEqual([expect.stringContaining('$60')]);
  });

  it('shows the risk but never warns while no risk per trade is set', () => {
    const { riskAtBackstop, warnings } = planGuidance({ plannedEntry: 1.2, quantity: 2 }, rules());

    expect(riskAtBackstop).toBe(60);
    expect(warnings).toEqual([]);
  });

  it('has no risk without a quantity', () => {
    expect(planGuidance({ plannedEntry: 1.2 }, rules()).riskAtBackstop).toBeNull();
  });
});
