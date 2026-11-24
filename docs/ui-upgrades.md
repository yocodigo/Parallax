# UI and UX upgrades

Written 2026-11-14 from a read of the pages and components. Build in this order, one commit
at a time, after the current rules-v3 step is finished. Each item names the model that fits.
No item changes a calculation; these are layout, navigation, and wording.

## Problems found

- Seven nav items, three of them overlapping (Performance, Performance Review, Insights).
  Insights mixes settings (circuit breakers, rule settings) with reports.
- The daily habit (plan the day, import, review each trade, read the coaching) is spread over
  Import, Journal, and Performance Review. No page shows what is left to do today.
- The journal is one flat list with no grouping, filter, or paging. Every trade card shows
  five buttons (context, gates, entry review, exit review, screenshots).
- Performance stacks 20+ charts on one scroll.
- Pages use three different widths (3xl, 4xl, 6xl), so content jumps between pages.
- Times are shown in New York time; the user trades on Pacific time.

## 1. Today page (new home) — Opus, high

`/` becomes Today: the daily loop as four steps, each showing done or not done.
1. **Plan:** the day's fib and overnight levels (the daily plan form, collapsed once saved).
2. **Import:** drop the statement here; shows the import report in place.
3. **Review:** today's trades in order, one row each, with a review status. "Review" opens the
   review form for that trade with the voice button first.
4. **Coach:** the coaching for today's reviews, with the button to write it.

A header line gives today's count, net P/L, and how many trades are reviewed. A day picker
steps back to earlier days. Empty state: the four steps with only Plan active.

## 2. Navigation: seven items to five — Sonnet, medium

| New item | Holds |
|---|---|
| Today | item 1 |
| Journal | the full history (item 3) |
| Performance | charts, tables, and the Performance Review as a tab (item 4) |
| Rules | strategies, rule settings, circuit breakers, recording prompts |
| Markets | the Alpaca dashboard |

Import is a button on Today and Journal, not a nav item; `/import` stays as a route. The
reports now on Insights (mistake ledger, checklist, stop replay) move to Performance under
Discipline. Old URLs redirect.

## 3. Journal: days, rows, filters — Sonnet, high

- Group entries by New York trading day. Day header: date, trades, net P/L, reviewed x of y.
- One compact row per trade: time, contract, quantity, result, setup tag, review status.
  Clicking a row expands it; the five buttons become tabs inside the expanded panel
  (Summary, Entry, Exit, Context, Screenshots), each loaded on demand as now.
- Filters above the list: mode, result (win, loss, scratch), reviewed or not, setup.
- Show the 10 most recent trading days, then "Show earlier days".
- Plans and theses with no trade sit in their day as their own rows.

## 4. Performance: tabs and takeaways — Sonnet, medium

- Tabs: Overview, Breakdowns, Discipline, Modes, Tables, Review. One tab renders at a time.
- Filters stay visible while scrolling and apply to every tab.
- Every chart leads with its one-sentence takeaway (many already have one as a caption);
  move it above the chart and keep the caption for definitions.
- Overview shows each headline figure with its change against the prior period of equal length.

## 5. One page frame — Sonnet, medium

A shared `PageShell` (width `max-w-6xl`, title, subtitle, optional actions) used by every
page, and a shared `Card`. Forms keep a readable inner width (`max-w-3xl`) inside it.

## 6. Display time zone — Sonnet, medium

A setting (default Pacific) used wherever a time is shown or typed. The code keeps New York
time for sessions and windows; only display changes. Charts name the zone in their caption.
This is rules-v3 build step 7.

## 7. Visual pass — Opus, high, with the frontend-design guidance

Propose a direction first and wait for approval before changing components. Scope: a type
scale with tabular numbers for every figure, one accent color, green and red reserved for
P/L, a chart palette that reads in light and dark, denser tables, and consistent spacing.
Write the decisions into CLAUDE.md so later sessions follow them.

## 8. States and small screens — Sonnet, medium

- Loading skeletons in place of blank cards; errors offer "Try again" beside the reference.
- Below 640px the nav collapses to a menu, and Today's Review step keeps the record button
  within thumb reach, since the end-of-day review may happen on a phone.
- A focus trap for the New entry drawer (noted as missing in CLAUDE.md).
