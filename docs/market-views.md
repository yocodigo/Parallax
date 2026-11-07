# Market-Data Views

Comparison and analysis views for the existing Alpaca market-data side of Parallax (bars,
correlation, risk panels). This file covers how multiple tickers are compared; it does not
change the journal, dashboard, or detectors.

Public-repo-safe: no personal results here. Uses the existing /api/bars route and Alpaca data.

## 1. The core choice: compare in percent, analyze in price

Two different jobs, two different charts:
- **Compare many tickers → percentage scale.** Rebase each series to its percent change from
  the start of the visible window. One shared axis answers "which moved more, and did they
  move together." Never one dollar axis for many tickers (a $40 name is invisible next to
  SPY), and not per-ticker axes (unreadable past two or three lines).
- **Analyze one ticker → price scale.** A single-ticker price chart keeps a dollar axis, since
  levels, fib extensions, and Bollinger Bands are all in dollars.

That is **by design, not a conflict** with the percentage rule above: the percent rule is for
comparing several tickers on one axis, and a single ticker's levels are prices, which a percent
axis would hide the numbers for. So a view with one ticker uses dollars and a view with several
uses percent.

**Not built yet.** The only chart today (`PriceChart.jsx`) is the rebased comparison, and it
stays in percent even when one symbol is loaded. The dollar-axis single-ticker chart, with its
levels, is still to build.

## 2. Multi-ticker comparison chart (rebased)

- Each series = `(price / price_at_window_start − 1) × 100`, plotted on one axis in percent.
- **Baseline at 0%.**
- **Rebase from the visible window, not a fixed date:** changing the date range re-rebases
  every line to the new first bar, so the comparison always reflects the move across what's on
  screen.
- Tooltip shows each ticker's percent change and its actual price at that bar.
- Legend toggles a line on/off; toggling off a line does not re-rebase the others.
- Up to ~8 tickers (matches the current 10-symbol cap on /api/bars); beyond that the chart
  gets noisy, so cap and tell the user.

## 3. Relative strength vs. a benchmark

- A benchmark selector (default SPY). Each line = the ticker's percent change minus the
  benchmark's percent change over the window, so SPY plots as a flat 0% reference.
- Above 0 = outperforming SPY, below = lagging. This is the leaders/laggards read that feeds
  the sector-rotation layer in the full-analysis protocol.

## 4. Correlation, over time not just a snapshot

- **Keep the existing correlation matrix** (one value per pair over the window) as the
  overview.
- **Add a rolling correlation line** for a chosen pair: correlation of daily returns over a
  trailing window (`ROLL = 20` bars **(confirm)**), plotted through time. Shows when a
  relationship held and when it broke — which a single matrix number hides.
- **SMT highlight (SPY vs. QQQ):** on the rebased chart, mark points where one makes a new
  window high or low and the other does not. That divergence is the SMT signal in Joel's
  framework. Start with SPY/QQQ; make the pair selectable later.

## 5. Why both the matrix and the chart

They answer different halves of one question. The matrix gives the strength of each pair's
relationship as a single number; the rebased chart and rolling correlation show *when* that
relationship held or broke. Keep both, side by side.

## 6. Defaults and controls

- Shared controls: ticker set, date range, benchmark, rolling window.
- Default view: rebased percentage comparison of the current ticker set, baseline at 0%,
  benchmark SPY available for the relative-strength toggle.
- All percentage math is pure and unit-tested; charts use Recharts with Testing Library + MSW,
  matching the rest of the app.

## 7. Build order

1. Rebasing + relative-strength math as pure functions in `src/lib/compare.js`, unit-tested.
2. Rolling correlation in the existing correlation lib, unit-tested.
3. Rebased multi-ticker chart (section 2) with window-based rebasing and the 0% baseline.
4. Relative-strength toggle (section 3).
5. Rolling correlation line + SMT highlight (section 4).
