import { describe, expect, it } from 'vitest';
import { HEAT_BAND, heatSummary, premiumFromDelta, premiumHeat, winnerHeat } from '../optionHeat';

// A bought SPY call, two contracts at a 2.00 premium, held 15:15:32 to 15:20:52.
const call = {
  assetClass: 'option',
  optionType: 'call',
  direction: 'long',
  quantity: 2,
  multiplier: 100,
  entryPrice: 2,
  exitPrice: 2.4,
  fees: 0,
  openedAt: new Date('2026-11-04T15:15:32Z'),
  closedAt: new Date('2026-11-04T15:20:52Z'),
};
const minute = (m, l, h) => ({ t: `2026-11-04T15:${m}:00Z`, o: l, h, l, c: h, v: 1 });
// Every minute of the window (15:15 to 15:20) has a bar; the lowest premium
// was 1.70, at 15:17.
const full = [minute(15, 1.9, 2.05), minute(16, 1.8, 2), minute(17, 1.7, 1.9), minute(18, 1.85, 2.1), minute(19, 2, 2.3), minute(20, 2.2, 2.45)];

describe('premiumHeat', () => {
  it("takes the worst premium against the trade from the contract's own bars, in dollars and as a share of the premium", () => {
    const heat = premiumHeat(call, full);

    expect(heat).toMatchObject({ source: 'bars', barCoverage: 1, edgeMinutesOnly: false, between: null });
    expect(heat.perShare).toBeCloseTo(0.3);
    expect(heat.dollars).toBeCloseTo(60);
    expect(heat.percent).toBeCloseTo(0.15);
  });

  it('counts the share of window minutes that had a bar', () => {
    // Three of the six minutes printed.
    expect(premiumHeat(call, [full[0], full[2], full[5]]).barCoverage).toBeCloseTo(0.5);
  });

  it('reads only the minutes from the fill to the exit', () => {
    const outside = [minute(14, 0.5, 0.6), ...full, minute(21, 0.4, 0.5)];

    expect(premiumHeat(call, outside).perShare).toBeCloseTo(0.3);
  });

  it('is zero, not negative, when the premium never went below the fill', () => {
    expect(premiumHeat(call, [minute(16, 2.05, 2.2)]).perShare).toBe(0);
  });

  it('flags a trade under two minutes and also measures the bars strictly between its fill and exit minutes', () => {
    const quick = { ...call, closedAt: new Date('2026-11-04T15:17:10Z') };

    const heat = premiumHeat(quick, full);

    expect(heat.edgeMinutesOnly).toBe(true);
    // Only 15:16 lies strictly between 15:15 and 15:17.
    expect(heat.perShare).toBeCloseTo(0.3);
    expect(heat.between.perShare).toBeCloseTo(0.2);
    expect(heat.between.dollars).toBeCloseTo(40);
  });

  it('has nothing between for a quick trade whose fill and exit minutes touch', () => {
    const quick = { ...call, closedAt: new Date('2026-11-04T15:16:10Z') };

    expect(premiumHeat(quick, full)).toMatchObject({ edgeMinutesOnly: true, between: null });
  });

  it('is null without a bar in the window', () => {
    expect(premiumHeat(call, [minute(21, 2, 2.1)])).toBeNull();
  });
});

describe('premiumFromDelta', () => {
  it("estimates the premium heat from the stored delta and the underlying's move against the trade", () => {
    // Delta 0.5 and 0.60 of SPY against: about 0.30 a share.
    const heat = premiumFromDelta(call, 0.5, 0.6);

    expect(heat).toMatchObject({ source: 'delta', barCoverage: null });
    expect(heat.perShare).toBeCloseTo(0.3);
    expect(heat.dollars).toBeCloseTo(60);
    expect(heat.percent).toBeCloseTo(0.15);
  });

  it("uses the delta's size, so a put's negative delta estimates the same way", () => {
    expect(premiumFromDelta({ ...call, optionType: 'put' }, -0.5, 0.6).perShare).toBeCloseTo(0.3);
  });

  it('is null without a delta or an underlying move', () => {
    expect(premiumFromDelta(call, null, 0.6)).toBeNull();
    expect(premiumFromDelta(call, 0.5, null)).toBeNull();
  });
});

describe('winnerHeat', () => {
  const underlying = { mae: 0.6, mfe: 1.4, maeR: 0.6, mfeR: 1.4, stopSource: 'derived', stopRule: 'band_cross_s2', edgeMinutesOnly: false, between: null };

  it("prefers the contract's own bars", () => {
    expect(winnerHeat(call, { optionBars: full, delta: 0.5, underlying }).premium.source).toBe('bars');
  });

  it('falls back to the stored delta, then to no premium figure: never an assumed delta', () => {
    expect(winnerHeat(call, { optionBars: [], delta: 0.5, underlying }).premium.source).toBe('delta');
    expect(winnerHeat(call, { optionBars: [], delta: null, underlying }).premium).toEqual({ source: 'none' });
    expect(winnerHeat(call, { optionBars: [], delta: 0.5, underlying: null }).premium).toEqual({ source: 'none' });
  });

  it('keeps the underlying excursion beside it, in points and R with its stop source', () => {
    expect(winnerHeat(call, { optionBars: full, delta: null, underlying }).underlying).toBe(underlying);
  });

  it('is only for winners, judged on gross P/L', () => {
    expect(winnerHeat({ ...call, exitPrice: 1.9 }, { optionBars: full, delta: null, underlying })).toBeNull();
    expect(winnerHeat({ ...call, exitPrice: 2, fees: 0 }, { optionBars: full, delta: null, underlying })).toBeNull();
    // A gross win that fees turned into a net loss is still a win.
    expect(winnerHeat({ ...call, exitPrice: 2.01, fees: 5 }, { optionBars: full, delta: null, underlying })).not.toBeNull();
  });
});

describe('heatSummary', () => {
  const bars = (percent, extra = {}) => ({ source: 'bars', percent, dollars: percent * 200, barCoverage: 1, edgeMinutesOnly: false, between: null, ...extra });
  const under = (mae, maeR, stopSource) => ({ mae, maeR, stopSource });
  const row = (premium, underlying = under(0.5, null, null)) => ({ premium, underlying });
  const rows = [
    row(bars(0.02), under(0.2, 0.2, 'plan')),
    row(bars(0.08), under(0.4, 0.4, 'derived')),
    row(bars(0.12), under(0.6, 0.6, 'derived')),
    row(bars(0.3, { barCoverage: 0.4 }), under(1, 1, 'derived')),
    row(bars(0.25, { edgeMinutesOnly: true }), under(0.8, null, null)),
    row({ source: 'delta', percent: 0.1, dollars: 20, barCoverage: null }, under(0.3, null, null)),
    row({ source: 'none' }, null),
  ];

  it('keeps full-coverage, clean-window bar figures as the trusted set and counts what each reason leaves out', () => {
    const summary = heatSummary(rows);

    expect(summary).toMatchObject({
      winners: 7,
      premium: { trades: 3, excluded: { partialCoverage: 1, edgeMinutesOnly: 1, delta: 1, none: 1 } },
    });
  });

  it(`bands the trusted premium heat in ${HEAT_BAND * 100}% steps, with percentiles`, () => {
    const { premium } = heatSummary(rows);

    expect(HEAT_BAND).toBe(0.05);
    expect(premium.bands.slice(0, 3)).toEqual([
      { from: 0, to: 0.05, trades: 1 },
      { from: 0.05, to: 0.1, trades: 1 },
      { from: 0.1, to: 0.15, trades: 1 },
    ]);
    expect(premium.percentiles.p50).toBeCloseTo(0.08);
    expect(premium.percentiles.p90).toBeCloseTo(0.12);
  });

  it('takes in every trade with a premium figure when asked, still flagged by source', () => {
    const { premium } = heatSummary(rows, { includeAll: true });

    expect(premium.trades).toBe(6);
    expect(premium.excluded).toEqual({ partialCoverage: 0, edgeMinutesOnly: 0, delta: 0, none: 1 });
  });

  it('keeps the underlying heat in R apart by where the stop came from, and in points for every trade', () => {
    const { underlying } = heatSummary(rows);

    expect(underlying.r.plan).toMatchObject({ trades: 1 });
    expect(underlying.r.derived).toMatchObject({ trades: 3 });
    expect(underlying.r.derived.percentiles.p50).toBeCloseTo(0.6);
    // Every trade with an underlying measurement, stop or not.
    expect(underlying.points.trades).toBe(6);
  });

  it('has null percentiles for an empty group', () => {
    expect(heatSummary([]).premium.percentiles).toEqual({ p50: null, p75: null, p90: null });
  });
});
