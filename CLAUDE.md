# Parallax

Trading dashboard and journal: market data from Alpaca, plus a journal of trade plans,
reviews, and investment theses stored in Postgres. Next.js 16 (App Router), Drizzle,
Vitest, JavaScript (not TypeScript).

## Commands

- `colima start`: start Docker, which brings Postgres back up (`restart: unless-stopped`). Colima does not
  start on its own after a reboot. First run, or after `docker compose stop`: `docker compose up -d`.
- `npm run dev`: dev server
- `npm run db:generate -- --name=<snake_case_description>`: generate a migration after editing `src/db/schema.js`
- `npm run db:migrate`: apply migrations to the dev database
- `npm run db:seed-demo`: fill the demo's database (`DEMO_DATABASE_URL`, never `DATABASE_URL`) with the
  made-up week in `src/lib/demoSeed.js`. Migrate it first with `DATABASE_URL=<demo url> npm run db:migrate`.
  Refuses a database with any trade, entry, strategy, or daily plan; to reseed, start a fresh one.
- `npm run perf:months -- --mode=live --year=2026 --asset=option`: print the monthly performance table
  and year-to-date totals from `DATABASE_URL` (New York closing months; flags optional, live and the
  current year by default), to reconcile imports against the spreadsheet. Read-only.
- `npm run db:backfill-setups`: bring context snapshots saved before version 3 up to it in `DATABASE_URL`:
  `setups` (the four-touch grade and the detected setups) and `levels`, from Alpaca's minute and daily bars (one
  fetch of each per symbol and New York day) and the day's plan as it is now. Safe to rerun: it only touches
  snapshots without `levels`; a failed fetch is retried next run.
- `npm run db:backfill-underlying`: record `underlying_entry` (and a derived `underlying_stop` where the band-cross
  setup fired) for entered options without one, in `DATABASE_URL`, from Alpaca's minute bars (one fetch per symbol and
  New York day). Safe to rerun: it only touches options with no underlying entry, and never a plan's stop.
- `npm run test:unit`: unit and component tests (no database needed)
- `npm run test:db`: database integration tests (needs Postgres running)
- `npm run test:run`: all tests
- `npm run test:e2e`: the Playwright test of the main flow (`e2e/journal.e2e.js`: sign in, plan, entry,
  exit, result, sign out). It builds the app and serves it on port 3100 against its own `parallax_e2e`
  database (created and emptied by `e2e/global-setup.js`), with Alpaca keys blanked. Recording the entry
  still captures context: Alpaca answers 401 without keys and Cboe's VIX file is really fetched; both are
  logged and left null, and neither affects the test. Not part of
  `test:run`; run it before a deploy. First time: `npx playwright install chromium`.
- `npm run lint`, `npm run build`

## How we work

- Commit straight to `main` in small, logical commits using Conventional Commits
  (`feat`, `fix`, `refactor`, `test`, `build`, `ci`, `docs`, `chore`). Imperative subject line;
  add a body explaining why when it isn't obvious.
- Test-first: write the failing test, run it and show me the failure, then write the minimum
  code to pass. Never commit a failing test.
- Before every commit: `npm run lint && npm run test:run`. Also run `npm run build` when a commit
  touches routes, config, or dependencies.
- Refactors get their own commits, separate from behavior changes.
- After each commit, stop and summarize what changed and why, so I can review before we move on.
  Explain anything non-obvious; I need to be able to explain this code myself.
- After a change that affects what renders in the browser — components, layout, styles, nav,
  forms, or user-facing copy — stop at the first reviewable change, name the route to open and
  what to try, and wait. Don't batch UI changes and stop once at the end. If a UI file changed
  with no visible effect, say so in one line and keep going.
- Problems you notice outside the current task go to the Roadmap as deferred cleanup, not fixed.
- Never commit broker statements, exported trade data, or recorded audio. Import fixtures are
  synthetic: files matching the real format with invented accounts and symbols.
- Ask before pushing.
- New dependencies: pin to a release at least two weeks old.

## Architecture

- `src/lib/`: pure logic with unit tests (bars, correlation, risk, timeframes, `tradePlan`,
  `journalEntry`, `tradeFill`, `tradeMetrics`, `mistakeLedger`, `excursions`, `historyWarnings`,
  `circuitBreakers`, `circuitBreakerSettings`, `strategy`, `checklistReport`, `performanceReview`, `reviewCoach`, `reviewRange`, `setupRules`, `format`, `session` (signed sign-in tokens), `today`, shared `symbol` validation). Validation uses Zod 4 and returns `safeParse` results.
- `src/db/schema.js`: Drizzle schema. Migrations live in `drizzle/` (generated and committed,
  including `meta/`). Never hand-edit a migration that has been applied.
- `src/lib/context/`: pure pieces of the entry context snapshot (indicators, macro calendar, VIX,
  option helpers, `buildContext`).
- `src/lib/setups/`: pure building blocks for the setup detectors in `docs/private/setups.md`.
  Primitives: bar type, close location, and overlap (`candles`); ATR and volume and range classes
  against prior bars (`relative`); `bollinger`; swings, trend, dealing range, and mid-range
  (`swings`); `displacement`. Timeframes: minute bars are kept to the regular session
  (`sessionBars`, with `EXTENDED_HOURS` off) and combined into clock-aligned 5m and 15m bars
  (`resample`, which leaves out the bar still forming). Signals: the 15m direction (`bandCross`:
  long or short by which side of the middle band each close is on, marking the close that crossed);
  the 5m entry (`isEntryCandle`: for a long, an up candle breaking the previous high with little
  overlap; `findEntry`: the first one after a cross, until the bias flips or the session closes);
  the 1m room to the outer band from the entry close (`roomToBand`, at least `ROOM_MIN` ATRs); and
  four-touch breaks (`fourTouchBreaks` in `fourTouch.js`, on `trendline.js`): a line through two
  swing points (`TRENDLINE_K` bars a side), touches within `TOL` ATRs merging until a bar moves
  `BOUNCE` ATRs away, counted back from the first swing point while the line held, within the
  trading day. Three touches establish it, it must exist by the 4th approach (which starts at the
  first bar back at the line), and a close through on that approach is the break: valid with a 4x
  body and confirmed acceptance (`breakOutcome`), a trap if any line that found it saw a reclaim,
  weak without the body, graded A only with both compression and good spacing (even gaps, or one
  much shorter than the rest). And the 1m reaction at a target level (`reactionAt` in
  `reaction.js`): from the first bar within `TOL` of it, the first rule met decides: rejected
  (a close `REJECT_DIST` ATRs back, from the touch bar through the next `REJECT_BARS`), ripped
  (a displacement close beyond, held `RIP_BARS` bars), or oscillating (closes switching sides
  twice within `OSC_BARS` bars, the touch being the first; drifting when the last close is beyond
  and past the touch close), else none.
  Bars use Alpaca's keys (`t o h l c v`), oldest first; detectors take the index `i` of the latest
  closed bar and never read past it. Every threshold is a named default in `settings.js`, tagged
  with its setups.md section and named as the doc names it where it does. Threshold checks go
  through `atMost`/`atLeast` (`compare.js`), which allow for floating-point error in decimal
  prices (761.40 − 761.00 isn't exactly 0.4).
- `src/server/`: server-only fetchers that call outside services (`marketContext.js`, and
  `minuteBars.js`, Alpaca's minute bars for the gates and the reviews; `dailyBars.js`, the daily bars
  before a day for the level map; and `reviewFacts.js`, the Performance Review's database reads),
  tested with MSW in the node environment.
- `src/db/journal.js`, `trades.js`, `settings.js`, `strategies.js`, `contexts.js`, `screenshots.js`, `dailyPlans.js` (a day's plan for one symbol, SPY by default in the form, and every caller reads the plan of the trade's own symbol: the overnight highs and lows and the fib extensions, which give the exit review its T1 and T2; every field but the date and symbol is optional, a fib whole or not at all, so the overnight levels can be saved before the fib is anchored, and a plan with no working fib counts as no plan for Target OK, the exit review, and the coach), `performanceReviews.js` (the last Performance Review of each date range), `imports.js`, and `signIn.js` (wrong passwords in `sign_in_failures`, counted per IP for the sign-in limit): repository
  functions. They take `db` as the first argument so tests can
  pass the test database.
- `src/db/index.js`: `getDb()`, created lazily (builds need no database) and cached on `globalThis`.
- `src/app/api/*/route.js`: route handlers. Invalid input returns 400 with `{ error, fieldErrors }`.
  Every handler is wrapped in `withErrorLogging(route, handler)`, so an uncaught error is logged and
  answered with 500 `{ error, requestId }`, never Next's default error page.
- Sign-in (`src/proxy.js`): every page and API route needs the session cookie except `/login` and
  `/api/session`. Signed out, a page visit redirects to `/login?next=<path>` (checked by
  `safeNextPath`) and an API call gets 401. `POST /api/session` checks `APP_PASSWORD` and sets an
  httpOnly cookie signed with `SESSION_SECRET` (`src/lib/session.js`), good for 30 days; `DELETE`
  clears it. Five wrong passwords per IP (`x-real-ip`) in 15 minutes answer 429. A missing secret
  fails closed. Both env vars are needed in `.env.local` for `npm run dev`.
- Demo mode (`isDemo()` in `src/lib/demo.js`, on when `NEXT_PUBLIC_DEMO_MODE` is `true` at build time):
  the proxy skips sign-in and answers every API write (anything but GET, HEAD, OPTIONS) with 403
  `{ error: 'The demo is read-only.' }`. That also stops the paid Claude and ElevenLabs routes, which
  are all POSTs; keep any new paid route a POST. It also refuses `/api/positions` (the trading
  account's live positions; the home page leaves out Portfolio Risk), and the demo's Alpaca keys are a
  separate, empty paper account anyway. Market data reads (`/api/bars`, reviews, gates, MAE/MFE) stay
  open and spend the demo keys' rate limit. Set the variable at build time: unset then, the server
  reads it at runtime while the browser doesn't. The UI hides the journal forms (voice and weekly
  review included), the imports, delete and record buttons, screenshot upload and remove, the coaching
  button (stored coaching still shows), and sign-out, and the nav says it's a demo. The strategy and
  circuit-breaker editors stay, and saving shows the 403's message.
- Errors and logging (`src/lib/log.js`): log server errors with `logError(message, { route, requestId,
  error, ... })`, never bare `console.error`. It writes one JSON line, with the error's stack and
  `cause`. Every logged error response includes `requestId(request)` (Vercel's `x-vercel-id`, or a
  random id locally); the UI shows it as "(Reference: …)" via `apiErrorMessage` in `fetchJson.js`.
  Upstream error details go to the log, never to the response. `src/instrumentation.js`
  (`onRequestError`) logs errors outside route handlers, such as page renders, with React's `digest`;
  `app/error.js` and `app/global-error.js` show that digest as the reference. Errors in client
  components only reach the browser console for now.
- `src/components/`: client components. They load data with SWR using `fetchJson` from `src/lib/`.
  Forms post to the API and leave validation to the server, showing its `fieldErrors` under each
  input (`Field.jsx`); after saving they call `mutate('/api/journal')` to reload the list.
  On `/journal` the entry forms sit in the `NewEntry.jsx` drawer, one tab each (voice note, daily plan,
  plan, review), kept mounted while hidden so a draft survives switching tabs or closing; saving on the
  plan or review tab closes it (the voice note stays open to show it saved). It has no focus trap yet.
  Put `hidden` on an element without a display class: Tailwind's `flex` beats it.
- Display time zone (`src/lib/displayZone.js`, `useDisplayZone.js`, `DisplayZonePicker.jsx` in the nav menu beside the theme):
  a browser setting (localStorage, Pacific by default, four US zones) for how a moment is shown, so the server never reads it.
  `formatInZone(instant, zone, options)` formats a moment on that clock and the zone is named where it could be
  misread (chart tooltips via `formatCloseTime`, the exit review's touch time, `WRITTEN`). Used for the fill and exit times typed on a trade (`toZoneInput`, `fromZoneInput`: a datetime-local value is read on the display zone, not the browser's), fill times shown (`formatTradeTime(openedAt,
  zone)`, New York when no zone is passed, so the coaching prompt stays New York time), tooltips, journal and coaching
  times, and the Performance Review's written time. Left in New York on purpose, and captioned so: sessions and month
  boundaries (`timeOfDay`, the monthly charts and the dates in the chart summary sentences, the lockout windows and the typed window times in `RuleSettings.jsx`),
  and calendar dates (a daily plan's date, an option's expiration). The import's time zone select is the statement's, not this.
- Theme and dark mode: colors come from CSS variables, so components need no `dark:` classes.
  `src/lib/palette.cjs` (CommonJS, for `tailwind.config.js`) points the gray, red, green, amber, and
  blue classes and white at variables. Light values are Tailwind's own; dark swaps each shade with its
  opposite (gray-50 and gray-950, red-800 and red-200), white becomes gray-900 (the card color), and
  gray-500 is lightened to keep secondary text readable. Dark applies when the system is dark unless
  `<html>` has `light`, or when it has `dark`. `ThemePicker.jsx`, in the menu behind the nav's settings gear (with Sign out), saves the choice
  (`src/lib/theme.js`), and `themeScript` in the layout's `<head>` applies it before the page draws.
  Components use only those five hues (a test checks); charts read `rgb(var(--color-…))`.
- Tests live in `__tests__` folders next to the code they test.
  - Database tests are named `*.db.test.js`, run against the `parallax_test` database (migrated once
    per run, tables truncated before each test), one file at a time (`fileParallelism: false`).
  - Route tests call the handlers directly and swap in the test database with `vi.mock('@/db', ...)`.
    To check what was logged, use `captureErrorLogs()` from `src/mocks/logs.js`; assert the logged
    `requestId` matches the response's.
  - Component tests use Testing Library and MSW; see `PriceChart.integration.test.jsx`.
  - MSW starts in `vitest.setup.js`, which only the unit project loads. A database test that also
    mocks an outside API starts its own server; see `weekly-review/__tests__/route.db.test.js`.
  - Tests of code that runs on the server without a database (voice routes, `FormData` parsing)
    start with `// @vitest-environment node`, so they get Node's `Request`, `File`, and `FormData`.
- Voice journal: `VoiceNote.jsx` records, `POST /api/voice/transcribe` calls ElevenLabs Scribe
  (`scribe_v2`, journal tickers as keyterms), `POST /api/voice/draft` asks Claude (`claude-opus-5-5`,
  structured output in `src/lib/voiceDraft.js`) for a draft, and the plan or review form opens
  prefilled for confirmation. Needs `ELEVENLABS_API_KEY` and `ANTHROPIC_API_KEY` in `.env.local`.
- Trade lifecycle: `TradeProgress.jsx` (on each trade-linked journal entry) shows the status and
  result; the plan's own entry records the next step through `POST /api/trades/[id]/entry` and
  `/exit` (409 when the trade is in the wrong state). `recordEntry`/`recordExit` only update a trade
  in the right state, so a double submit can't overwrite a fill. `tradeMetrics.js` computes P/L (net
  of fees, times the multiplier), R (1R is measured from the entry fill once there is one), and
  `holdMinutes` (exit fill minus entry fill; never stored, so imports show it in their preview's Held column).
- MAE/MFE: `GET /api/trades/[id]/excursions` fetches Alpaca bars (IEX feed, `adjustment: raw` to
  match fill prices) from the start of the bar holding the fill to the exit, or to now while open;
  `barWindow` picks minute, hourly, or daily bars by holding time. Computed on demand, never stored; a
  closed trade's bars are cached for a day. An option is measured on its underlying's bars
  (`underlyingExcursions`, answered with `measuredOn: 'underlying'`): SPY points from `underlying_entry`, R only
  from an `underlying_stop`, with the stop's source; none without an underlying entry. A trade held under
  `EDGE_MINUTES_HOLD` (2) minutes is flagged `edgeMinutesOnly` (`tradeWindow.js`: the fill and exit minutes hold
  prices from outside the trade) and also measured on the bars strictly between them (`between`). `TradeProgress`
  shows it as points, R, the stop's source, and the flag. Crypto not yet.
- Today (`/`, the home page and first nav link; `docs/ui-upgrades.md` item 1): the daily loop for one New York day
  and mode. `Today.jsx` has a day picker (never past today) and a Mode select (live by default) over `GET /api/today`
  (`?day`, today's New York date by default; `?mode`, live by default), which answers `{ day, mode, plans, summary }`:
  every symbol's daily plan for the day and `todaySummary` (`src/lib/today.js`) over the trades of that mode opened
  that day with their review entries. The header line gives the trades, net P/L of the closed ones, and reviewed x of y.
  Four steps, each with a status: Plan (the daily plan form for the picked day, collapsed to its levels once done; done
  only with a working fib, started with overnight levels alone), Import (the thinkorswim importer; imports aren't
  recorded, so done means the day has trades and every one has its exit), Review (the day's trades in order; a closed
  trade's Review button opens `VoiceNote` then `ReviewForm` for that trade; counts closed trades only), and Coach
  (`EntryCoaching` on each review of the day's trades, an open trade's included). The forms take optional props for
  it: `DailyPlanForm` `tradeDate` (leaves out its own Day field) and `onSaved`, `ReviewForm` and `VoiceNote` `trade`
  (no Trade select; a voice draft becomes that trade's review whatever kind it came back as), and `onSaved`,
  `onImported`, `onCoached`, so the day reloads. The page is `force-dynamic` (prerendered, the build's date would be
  baked into the picker's limit). The Review step names the display zone its times are on ("Times in Pacific"). The demo
  hides the forms and the importer, and Coach lists only the reviews that have stored coaching.
- Nav (`SiteNav.jsx`): Today, Journal, Performance, Rules, Markets (`/markets`; `/dashboard` redirects). Import is not a nav item: Today's second step holds the importer and the Journal header links to `/import`, which stays a route.
- Insights (the old `/insights` redirects to `/performance`; its reports sit in the Charts tab's Discipline section): history-based views. `MistakeLedger.jsx` (headed "Mistakes in R") loads `GET /api/insights/mistakes`
  (`?mode=` optional; the Discipline section passes the page's Mode), built from `listClosedTradesWithMistakes` and `mistakeLedger`: per mistake,
  the closed trades tagged with it (on any of their entries, once per trade) and their total and
  average R, plus the average R of trades with no mistakes as a baseline.
  `ChecklistReport.jsx` loads `GET /api/insights/checklist` (`?mode=` optional), built from
  `listClosedTradesWithRuleChecks` and `checklistReport`: closed checklist trades with every rule met
  against those entered anyway, and per rule how often it was skipped and its average R when skipped
  and when met. Rules are grouped by id (named by their latest text); deleted rules by their text.
- Performance (`/performance`, in the nav): the dollar-based dashboard (`docs/private/dashboard.md`).
  `PerformanceDashboard.jsx` loads `GET /api/insights/performance` (`?mode`, live by default; `?year`, the
  current New York year, or `all` for every year; `?asset`; `?strategyId`, a strategy id or `none` for trades with no setup;
  `?optionType`, call or put) for the trades closed in that year: `{ months, yearToDate, adherence,
  violationCosts, equity, rolling, timeOfDay, callsVsPuts, byUnderlying, bySetup, byGrade, byDetected, plansVsNoPlan, rDistribution, disciplineByMonth, emotionalControlByMonth }`, built by the pure functions in `src/lib/performance.js`
  (`summarize`, `monthlySummary`, `equityCurve`, `rollingExpectancy`, `timeOfDay`) and `adherence.js`. Wins
  and losses are judged on gross P/L, money is summed in whole cents, and every headline figure is labelled
  net or gross. `rollingExpectancy` is the last 20 trades and has no point until 20 have closed, so it
  restarts each January with a single year's filter (not with `all`); `timeOfDay` buckets by New York entry time in half hours
  (9:30 to 15:30, entries outside the session in a last `outside` bucket). The charts (`EquityCurve`,
  `MonthlyPnl`, `MistakeCostLedger`, `TimeOfDay`, `RollingExpectancy`, `WinRateVsBreakeven`: a month's win rate against
  its `breakevenWinRate`, a gap where that is null; `WinsLossesScratches`: wins and scratches up from zero, losses
  below it as negative counts; `AverageWinLoss`: the month's average win up and average loss down, in gross dollars; `ExpectancyByMonth`: net P/L per trade, gross in the tooltip; `ProfitFactorByMonth`: the month's net profit factor against a dashed 1.0 line, gross in the tooltip, a gap where it is null; `FeesVsGross`: the month's gross P/L up or down from zero beside its fees hanging below it in amber, the share of gross P/L in the tooltip; `DrawdownCurve`: the `equity` points' `drawdown` as an area hanging below zero, under the equity curve; `CallsVsPuts`: net P/L of calls and of puts from `callsVsPuts`, both slots always there; `ByUnderlying`: horizontal bars of net P/L per symbol from `byUnderlying`, best first; `BySetup`: the same per strategy from `bySetup` (named by the route), best first with the trades that had no strategy last; `ByGrade`: net P/L by the four-touch grade stored in the trade's context snapshot (`setups.fourTouch.grade`, read by `listContextGrades`) from `byGrade`: rows A, B, and no line, plus how many trades `unknown` (no snapshot, version 1 not yet backfilled, or no minute bars), counted apart so a gap never reads as no line; `ByDetected`: net P/L by detected setup from `byDetected` (rules-v3 section 6, from the snapshot's `setups.detected`): a row per detector whose setup was within `DETECTED_MAX_BARS` of the fill and there to trade, a trade counted in each of its own, then any setup against none, and how many trades `unknown` (no version 3 snapshot); `PlansVsNoPlan`: a table of trades with a plan entry written before the fill (`plannedBeforeFill`, from `planWrittenAt`; an import's later plan entry doesn't count) against the rest, from `plansVsNoPlan`, both rows always there; `DisciplineByMonth`: the share of Plan, Stop, and Exit checks passed per month from `disciplineByMonth` (`adherence.js`, the same pooling as the table's score), a gap where none applied, the month's net P/L in the tooltip, set beside the monthly P/L chart; `EmotionalControlByMonth`: the average 1-10 `emotionalControl` of the reviews linked to trades closed that month (the trades in the page's filters, each review once) from `emotionalControlByMonth` (`adherence.js`, ratings from `listReviewRatings`), a gap where no review was rated, the month's net P/L in the tooltip; `RDistribution`: closed trades in 1R bands from `rDistribution`, counting only trades with an initial stop and saying how many that leaves out)
  are presentational Recharts
  components taking route data as props, with round ticks from `chartTicks.js`; `TimeOfDay` shades the
  `LOCKOUTS` windows on a hidden clock axis, which needs `allowDataOverflow` or it drifts off the bars.
  The Charts tab groups them under Overview (headline strip, equity, drawdown, monthly and rolling stats), Breakdowns (time of day, setup, grade, detected setup, plan vs no plan, calls vs puts, underlying, fees vs gross, R distribution), and Discipline (mistake cost, discipline and emotional control by month, then the R reports that were on Insights: mistakes in R, the entry checklist, and the stop rules replayed, following the page's Mode, not Year or Asset).
  Below them, in a Modes section, `AllModes` loads `GET /api/insights/modes` (`?asset`, `?strategyId`, `?optionType`, as above; every closed trade, all years
  and modes, since modes are compared with each other and graduation counts build up): `ModeComparison`
  (`modeComparison`) and `GraduationTracker` (`graduation`). A setup is a strategy (trades with none are
  the last row). Each gate (backtest to paper, paper to live, live to a bigger size) is met when the last
  `GRAD_N` = 30 closed trades in that mode have net expectancy above zero; the live-minus-paper gap uses
  the same windows and shows only once both are full. `GRAD_N` is a default the spec marks (confirm), sent as `gradN` so the page doesn't
  import `performance.js`, which pulls in the detector code. The page's Setup and Call/Put filters (like Asset) feed both routes. The Year select ends with All years. Charts and Tables tabs sit under the filters: Tables (`PerformanceTables.jsx`) shows the monthly summary, the range's totals (named for the year or All years), and rule adherence (Window OK, Size OK, and Plan OK: a plan entry written before the fill, a strategy picked, and no checklist rule entered unmet, from `listPlanFacts`; and Stop OK: the exit no worse than the stop, blank for trades with no stop; and Exit OK: a planned exit reason, not one of `DISCOMFORT_EXIT_REASONS`; then a discipline score: those three checks passed out of the ones that applied) and the rule violations (each option trade in one row: followed, lockout only, size only, both) from the same response, and the modes below the charts belong to the Charts tab.
- History warnings: `HistoryWarnings.jsx` in the plan form asks `GET /api/insights/warnings` (mode,
  direction, assetClass, symbol; debounced) and lists what `historyWarnings` finds in closed trades of
  the same mode: same symbol, same direction and asset class, and same part of the New York session
  as now (open, midday, close). Each rule uses the 20 most recent matches and warns only with at least
  5 averaging -0.3R or worse. Option plans add days-to-expiration rules (0DTE, 1-7, 8+ DTE at entry,
  New York date), alone and with the session part. An option plan also asks for the underlying's invalidation level (`underlyingStop`, the voice
  draft's stop line too) and shows, from the saved rule settings (`planGuidance`, `src/lib/planGuidance.js`), the backstop
  premium and the dollars at risk if it fills, with warnings (never blocks) for a premium outside the band or a backstop
  risk over a set risk per trade. Tests that render `PlanForm` must serve that route, `/api/strategies`, and
  `/api/rule-settings` (MSW errors on unhandled requests).
- Circuit breakers: settings live in `circuit_breaker_settings` (one row, id 1; a null limit is off;
  `modes` they apply to, live by default), edited in `CircuitBreakers.jsx` on `/rules` through
  `GET`/`PUT /api/circuit-breakers`. `circuitBreakers` checks today's closed R (New York day), today's
  entries, and the losing streak. `POST /api/trades/[id]/entry` answers 409 `{ error, breakers }`
  while one is tripped for the trade's mode; resending with `override: true` records the entry and
  stores the breakers in `trades.overridden_breakers`. Plans and exits are never blocked.
- Heat on winners and after the exit (`rules-v3.md` section 8, items 8 and 3): `GET /api/insights/option-excursions`
  (`?mode`, live by default; `?year`, the New York year or `all`) runs `gatherOptionExcursions`
  (`src/server/optionExcursions.js`) over the closed option trades: the underlying's minute bars once per symbol and
  fill day, and each winner's own contract bars (`fetchOptionBars`, v1beta1, a bar only for minutes that traded).
  Per winner (gross win) `winnerHeat` (`src/lib/optionHeat.js`) gives the premium heat from the contract's bars
  (`source: 'bars'`, with `barCoverage`, the share of window minutes with a bar, and `edgeMinutesOnly` with a `between`
  figure), else from the delta the context snapshot kept (`listContextDeltas`, `source: 'delta'`, an estimate), else
  `source: 'none'` (never an assumed delta), beside the underlying's excursion. `heatSummary` keeps the trusted set
  (bars, full coverage, not edge-only) and counts the rest by reason; `summaryAll` takes in every premium figure. Every
  exit gets `afterExit` and `afterExitSummary`. Entry timing (rules-v3 8.9, `entryTiming.js`) rides the same call:
  each trade's entry against its setup's trigger bar (the strategy's detector, else the nearest setup any detector
  found the trade's way; the three-gate entry at the levels its snapshot kept, `listContextLevels`, null when none
  were, and a three-gate strategy's trade without them is untimed): early (the
  trigger bar closed after the fill, within `DETECTED_MAX_BARS` bars that exist), on, late, or none, as
  `timing: { rows, groups, untimed }` with each group's net P/L and the underlying's heat (points per underlying, R
  by planned or derived stop). It reads bars after the fill, so it is review-time only. Computed per call, never
  stored; a failed fetch answers 502.
  `OptionExcursions.jsx`, the Charts tab's "Heat and after the exit" section on `/performance` (the page's Mode and
  Year), asks only when its button is pressed: the premium heat chart in 5% bands over the trusted set, saying what it
  leaves out and why, with the rest behind a toggle; the underlying's heat and after-the-exit run as p50/p75/p90 tables,
  R by planned and by derived stop, points a row per underlying (never pooled across symbols); and how often T1 came
  after an exit short of it. It follows the page's Mode and Year only.
- Level reactions (`rules-v3.md` 8.10): `GET /api/insights/level-reactions` (`?symbol`, SPY by default; `?year`, one year,
  never all) runs `gatherLevelReactions` (`src/server/levelReactions.js`): a year of the symbol's minute bars
  (`fetchMinuteBarsBetween`, following Alpaca's page tokens; today's unfinished session left out), the daily bars from 62
  days before January 1, and that symbol's daily plans, into `levelReactions` (`src/lib/setups/levelReactions.js`). Per
  session after the first (which feeds the ATR) and per level fixed before the open (the prior day, week, and month highs
  and lows from `dailyLevels`, the plan's overnight levels and fibs from `planLevels`), the side comes from the open (a
  level above it is reached from below; one at the open exactly is skipped), only the first touch is judged, and
  `reactionAt` runs to the close. Result: `{ sessions, kinds: [{ kind, sessions, reached, rejected, ranThrough,
  oscillating, none, undecided }] }`. `LevelReactions.jsx`, its own section on `/performance` after the heat section,
  asks only when its button is pressed (the symbol picked from the traded ones, the page's Year); computed per call,
  never stored; a failed fetch answers 502.
- Plans not taken (`rules-v3.md` 8.11): `GET /api/insights/plans-not-taken` (`?mode`, live by default; `?year`, the New
  York year or `all`, by the day the plan was written) runs `gatherPlansNotTaken` (`src/server/plansNotTaken.js`) over
  `listUnfilledOptionPlans` (option trades with no fill and a plan entry; today's plans left out, their day not being
  over): per plan, the underlying's minute bars once per symbol and day, the contract's own bars (`fetchOptionBars`),
  and the day's working fib 50% for the symbol, into `replayPlan` (`src/lib/planReplay.js`). It enters at the planned
  premium on the first contract bar after the plan was written that traded there (with none planned, the open of the
  next bar; never reaching it is `never_triggered`, counted apart), then exits at the first of: invalidation (the
  underlying's 1m close beyond the plan's underlying stop), the backstop (sold at its level), T1 (the fib, only when
  ahead of the underlying at the fill; sold at that minute's contract close), the time stop, and the session's last
  minute, the backstop and time stop by the saved rule settings; the reversal exit is left out until built. A contract has
  bars only for minutes it traded, so exits other than the backstop sell at the last bar at or before their minute, and
  `barCoverage` says how many minutes had their own. `plansNotTakenSummary` turns the replays into `summarize()` trades of
  the planned quantity with the median fees of the option trades taken in the range taken off (an estimate, 0 with none).
  `PlansNotTaken.jsx`, its own section on `/performance` (the page's Mode and Year), asks only when its button is
  pressed; computed per call, never stored; a failed fetch answers 502.
- Level map, location, and room (`rules-v3.md` sections 3 and 4). `levelMap` (`src/lib/setups/levels.js`) gives a
  symbol's levels as of a time, `{ kind, price, tier, side, touchedToday, formedAt }`, from regular-session minute
  bars closed by then, the daily bars before the day, and the day's plan. Tier 1: prior day, week, and month highs and
  lows, the plan's Asia, London, and premarket highs and lows (typed in, never computed), and 5m and 15m equal highs
  and lows (`pools.js`, over today and the previous session, at the pool's outermost price). Tier 2: the opening range
  (`OPENING_RANGE_MIN`), the session's high and low so far, and the day's broken four-touch lines on the 1m and 5m
  (sloped: `price` at the last minute bar and `slope` per minute bar, counted in bars because the IEX feed skips
  quiet minutes). Tier 3: the fibs, the 5m dealing range's 50%, round numbers (`ROUND_STEP`), and 1m pools. `side`
  is against the last close; `touchedToday` counts only bars after the level formed (a broken line always is).
  Location OK is `levelLocation` (`location.js`): met within `LEVEL_NEAR` (confirm) 1m ATRs of a tier 1 or 2 level
  whose latest event that day was the trade's way, a break held for `N_ACC` closes with no close back within
  `N_RECLAIM`, or a sweep closing back on the side it came from; tier 2 also needs rising volume on that bar; anything
  else is floating. Room is `levelRoom` (`room.js`): points to the nearest untouched level ahead (any tier), and their
  ratio to the distance back to the stop on the underlying (an option's `underlying_stop`, a stock's
  `initial_stop`); no `ROOM_R_MIN` until enough trades have it. `levelsAtEntry` (`tradeGates.js`) runs both at the
  fill; `GET /api/trades/[id]/gates` returns `{ gates, location, room, setup }` and `TradeGates` shows the level and the
  room under the badges; the coaching pass grades Location the same way (`gatherCoachingFacts`, daily bars once per
  symbol and day). Computed on demand, never stored. The plan's fibs count at any time of day, as the exit
  review's T1 does, even before they were typed in.
- Structure R columns (`rules-v3.md` section 7), options only: `underlying_entry` (the underlying's price at the fill)
  and `underlying_stop` with `underlying_stop_source` (`plan` or `derived`) and, for a derived one,
  `underlying_stop_rule` (which rule derived it), kept consistent by check constraints. A plan sends `underlyingStop`
  (API only until the plan form gains the field) and `parseTradePlan` marks it `plan`; a plan's stop is never
  replaced, and only a derived one may be. After an option's entry is recorded (by hand or by the thinkorswim import),
  `after()` runs `captureUnderlying` (`src/server/underlying.js`: minute bars through the fill's minute) and
  `saveUnderlying`: the entry is the VWAP of the 1m bar holding the fill (`underlyingAtEntry.js`), and a stop is derived
  (`band_cross_s2`) only when the entry review's band-cross setup fired the trade's way before the fill and its S2 level
  is on the losing side of that entry; nothing else is ever guessed. Each capture replaces the earlier one as a
  whole (an import can correct the fill time), clearing a derived stop it no longer finds; a fill whose minute bar
  isn't on the feed yet is left null for `db:backfill-underlying`. Route tests mock `captureUnderlying`.
- Option execution (`rules-v3.md` section 8, `src/lib/optionExecution.js`): the performance route's `execution`
  holds tables over closed option trades, shown on the Tables tab by `PerformanceTables` when present: `holdTime`
  (trades, gross win rate, and net P/L by how long the position was held) and `exits` (`untriggeredExits`: exits a
  backstop fill or the time stop explains against those with no trigger, by the saved rule settings; only those two
  triggers count so far). `friction` (median fees plus an assumed spread, `ASSUMED_SPREAD` in `settings.js`
  since quotes aren't stored, against the median gross win, and the premium move to break even). `premiumBand` (results by entry premium, each bucket marked inside, partly, or outside the saved
  premium band). `moneyR` (`tradeMetrics.js`) is net P/L
  over the recorded stop's risk, or, with none, over the backstop's share of the premium, labelled assumed
  (`TradeProgress`); `rMultiple` and its consumers still leave options without R.
- Option rules as settings (`rules-v3.md` section 5): `rule_settings` (one row, id 1) holds the entry windows
  (New York clock times), contract range, premium band, risk per trade (null until the winners' heat sets it),
  backstop, and time stop, each with an `*On` flag whose values are kept while it is off. `ruleSettings.js` has
  the defaults (from `settings.js`) and `parseRuleSettings`; `getRuleSettings`/`saveRuleSettings` in
  `src/db/settings.js` (defaults until the first save; the route validates before saving); edited in
  `RuleSettings.jsx` on `/rules` through `GET`/`PUT /api/rule-settings`.
  Windows raise the bar instead of closing the door (an option rule; stock trades get no Window gate):
  `windowGate(openedAt, detected)` is met outside every
  window, and inside one only when a detected setup clears it (`clearsWindow`); missing it is the
  window_no_setup mistake, computed rather than tagged. Without detected setups (no bars, or a snapshot from
  before version 3, read by `listContextDetected` for the performance page and the Performance Review) a
  window entry is unknown. `windowCheck` in `adherence.js` is the one place adherence, the violation costs,
  and the review read it. The gates still use the default windows from `settings.js`, not the saved ones
  (nor does Size OK read the saved contract range). `inWindow` keeps the recorded fact for the entry
  review's flag.
- Strategies and the entry checklist: `strategies` with ordered `strategy_rules` (kind `edge` for the
  setup or `discipline` for risk and process), edited on `/rules` (`/strategies` redirects there) (`Strategies.jsx`, `GET`/`POST
  /api/strategies`, `PUT /api/strategies/[id]`). Editing keeps the ids of rules sent back with one.
  A strategy may name its `detector` (`band_cross`, `four_touch`, `reversal`, `three_gate`; null for a
  hand-written checklist, rules-v3 section 6). Its trades then get a Setup gate (`setupGate`: met when
  `strategySetup` finds that detector's setup within `DETECTED_MAX_BARS` of the fill, complete, a valid break, or a
  trap; unknown without minute bars, when `setupsAtEntry` gives undefined), and Direction and Entry are graded only for a
  band-cross strategy or a trade with no detector. The gates
  route (and the coaching pass) detects on demand and also returns the `setup` it found.
  A plan may name its `strategyId`; recording its entry then needs `ruleChecks` ({ ruleId: met } for
  every rule), saved in `trade_rule_checks` with a copy of the rule's text. Unmet rules get a 409
  `{ unmetRules }` (alongside any `breakers`) and `override: true` records the entry anyway.
- Context snapshot: after `POST /api/trades/[id]/entry` responds, `after()` runs `captureContext`
  (Alpaca daily and minute bars for SPY, QQQ, and the symbol, split-adjusted and only bars that ended
  before the fill; Cboe's daily VIX file; for options Alpaca's contract open interest and indicative
  snapshot) and saves it in `trade_contexts` (JSON with a `version`; first snapshot wins). Version 2
  adds `setups.fourTouch`: the entry review's four-touch break in the trade's direction (`fourTouchAt`),
  kept for its grade; `setups` is null without the symbol's minute bars, and missing from version 1. Version 3
  (rules-v3 section 6) fetches the underlying's own minute bars (`fetchMinuteBars`, five days back, for the 15m
  bands) and adds `setups.detected` (`detectSetups` in `src/lib/setups/detected.js`: the band cross, four-touch,
  reversal, and three-gate detectors on the bars closed before the fill, the trade's way only, each with
  `status`, `grade` (four-touch only), `completedAt`, and `barsSince` in its own timeframe's bars) and `levels`
  (the level map at the fill, with the day's plan, which the callers pass as `dailyPlan`; kept since a plan can
  be edited later, though an import reads the plan as it stands at import time, which can be days after the fill). `clearsWindow` (`gates.js`) is the window rule: a setup detected within `DETECTED_MAX_BARS` (3) bars of the
  fill that is complete (or, for a four-touch break, valid and grade A). A failing source is logged and left null. Live option values are kept only within 15 minutes of the fill.
  `TradeContext.jsx` shows it on demand via `GET /api/trades/[id]/context`. Entry route tests mock
  `after` and `captureContext`. Macro dates in `src/lib/context/macroCalendar.js` cover 2026-10-22
  through 2027-12-31 (BLS blocks automated requests); extend them yearly.
- Chart screenshots (setups.md 9.5): up to 3 per trade in `trade_screenshots` (bytea, optional label
  setup/entry/exit), deleted with the trade. `POST /api/trades/[id]/screenshots` takes a form with
  `image` and `label`; `src/lib/screenshot.js` caps it at 3.75 MiB (5 MB as base64, Claude's image limit) and takes the type
  from the file's first bytes (PNG, JPEG, WebP), never the browser's. `GET …/screenshots` lists them
  without bytes; `GET`/`DELETE …/screenshots/[shotId]` serve (private cache, `nosniff`) or remove one.
- Entry review (`TradeReview.jsx`, the "Entry review" button on `TradeProgress`; loads on demand).
  `GET /api/trades/[id]/review` returns `{ review }` from `reviewEntry`
  (`src/lib/setups/entryReview.js`), measured on the underlying's minute bars that closed before the
  fill: the 3.1 band-cross setup with its ideal entry and S2 stop and the fill's chase in R, the last
  5m bar's overlap and volume against the one before, 1m room to the outer band, the latest
  four-touch line in the trade's direction with its grade, lockout, mid-range, and pressure and Gann
  seasonal dates (`calendarDates.js`). The Gann date list in `settings.js` is a default tagged
  `(confirm)`: confirm it before trusting `seasonalDate`. The 3.3 and 3.4 detectors aren't part of
  "which setup fired" yet.
- Exit review (`TradeExitReview.jsx`, the "Exit review" button on closed trades; loads on demand).
  `GET /api/trades/[id]/exit-review` returns `{ review }` from `reviewExit` (`exitReview.js`) for
  intraday closed trades: T1 is the day's working fib 50% and T2 its 100% (only when T1 is ahead of
  the fill), the reaction at T1 comes from `reactionAt` and reads bars after the exit, and the
  verdict is by timing alone (`matched` means not early; an oscillation is `not_judged`, since one
  exit per trade can't show a partial). The recorded exit reason is shown beside the verdict, never
  used in it. For options the exit review route also answers `afterExit` (`afterExit.js`, rules-v3 8.3): how far
  the underlying ran the trade's way in the `POST_EXIT_MIN` (15) minutes after the exit's minute, from that minute's
  VWAP, in points and (with an underlying stop) R, how many of those minutes had bars, and whether the review's T1
  was reached; `TradeExitReview` shows it, even when the review skipped T1. Both review routes: 404, 409 until the
  entry or exit is recorded, and a null review with a reason for crypto. Stocks and options only.
- thinkorswim import (`/import`, `ThinkorswimImport.jsx`, `POST /api/imports/thinkorswim`): the
  account statement CSV is read from its Cash Balance section (`src/lib/import/thinkorswim.js`; it
  lists every fill with fees and a ref and ignores the statement's symbol filter; a paper-money statement leaves it empty, so the fills then come from its Account Trade History section, with no fees and a time-and-position ref). Times are in the
  zone thinkorswim is set to (the user's is Pacific), not New York. Option fills only; stock rows are
  listed as not understood. `pairFills` makes long trades flat to flat per contract (a sale while flat
  closes a position from before the statement; scaled trades get weighted average prices).
  `matchImport` skips trades entered at the same second (imported before), fills in a hand-recorded
  entry within 5 minutes or a same-New-York-day plan with no entry, and creates the rest. Without
  `confirm` the route only previews; with it, `applyImport` saves in one transaction (created trades
  get a plan entry so they show in the journal) and contexts are captured with `after()`. Imports skip
  circuit breakers and the checklist.
- Weekly review: `WeeklyReview.jsx` (top of `/journal`) posts to `POST /api/weekly-review` on demand,
  not with SWR, since each review is a paid Claude call. The route sends the past seven days of entries
  (`src/lib/weeklyReview.js`, dates in New York time) to Claude and returns `{ review, entryCount }` as
  plain text, or a null review without calling Claude when the week is empty. Closed trades come
  with a computed Result line (P/L and R) that Claude quotes; it's told not to compute figures
  itself. Text only, no text-to-speech.
- Deleting entries: `EntryDelete.jsx` on each entry in the journal list calls `DELETE /api/journal/[id]`
  (`deleteJournalEntry`). A plan whose trade has a fill is refused (409, and the button is hidden):
  the entry holds the trade's entry and exit controls. A plan never filled is deleted with its trade
  (its checklist answers, screenshots, and context cascade; other entries on the trade keep existing
  with the link set to null). The trade row is locked while checking, so a fill recorded at the same
  moment is seen, not deleted. Reviews and theses are deleted alone.
- Coaching pass (setups.md section 11): `EntryCoaching.jsx` on each review in the journal list shows the
  coaching stored on the review entry (`coaching`, `coached_at`) and a button to write or redo it, on
  request only (a paid Claude call). `POST /api/journal/[id]/coaching` coaches the review's linked trade alone,
  on the New York day it was filled (a null coaching, no Claude call, while it has no fill), or, for a review
  with no trade, the New York day it was written on: `gatherCoachingFacts`
  (`src/server/coachingFacts.js`, given a `tradeId` or the whole day) collects those trades in the order opened, each with its entries,
  entry and exit review, giveback, and stop adherence, plus history over the 20 most recent closed
  trades of the first trade coached's mode (what's working, stop adherence, the mistake ledger). It
  recomputes everything per call from Alpaca bars (one fetch per symbol and day) and stores no
  snapshot; a failed fetch fails the whole call. `formatCoachingInput` and `COACHING_SYSTEM_PROMPT`
  (`src/lib/coaching.js`) turn the facts into the prompt (each trade states its direction, contract, bet on the
  underlying through `tradeBias`, fill times in New York time, the strategy it was planned under, and the
  day's fib plan with its notes); Claude never sees raw bars or works out
  figures. Pure pieces: `giveback.js` (best open profit of 1R or more, closed at 0R or worse, stocks
  with a stop; options on their underlying through `underlyingGiveback`: points, and R with an underlying stop), `stopAdherence.js` (S1-S3 replayed against the exit), `whatsWorking.js` (R where a
  trade has a stop, dollar P/L where it has none, never mixed). A day with no trades returns a null
  coaching without calling Claude; a failed call keeps the earlier text.
- Performance Review (the Review tab on `/performance`; `/performance-review` redirects there; separate from the per-trade coaching pass): an aggregate
  coach over closed trades and journal entries in a date range. `PerformanceReview.jsx` has a Range select (last 7
  or 30 days counting today, all time, or custom dates; New York days, by the day a trade closed;
  `reviewRange.js` parses them and names the range key), a table of each mode's trades, win rate (gross),
  total and average P/L (net), then the stored analysis under five headings (`reviewSections.js`: Strengths,
  Patterns to Fix, Rule Adherence, Emotional Patterns, Recommendations for This Week) and a "Write review" or
  "Refresh analysis" button. `GET /api/insights/review` (`?range=7d|30d|all|custom`, `&from=&to=` for custom)
  returns `{ range, stats, tradeCount, review }` without calling Claude; `POST` (body the same, JSON) is the paid
  call (shares the voice routes' rate limit; a POST, so the demo's 403 stops it), saves the answer in
  `performance_reviews` (one row per range key, a rerun replaces it, a failed call keeps the old one) and
  returns `{ review }`; an empty range answers a null review with a reason and costs no call. The demo shows a
  stored review but hides the button. `gatherReviewFacts` (`src/server/reviewFacts.js`) reads the range's closed
  trades in every mode with their plan facts, the entries of those trades (any date) and the unlinked entries
  written in it, the fib plans of the range and of the days its trades were opened (a swing trade keeps its
  opening day's plan), and the strategies; `buildReviewFacts` (`performanceReview.js`) turns them into the JSON
  the coach reads: `modes` (each mode apart, never pooled: `overall`, `bySetup`, `byWeekday`, `byTimeOfDay`,
  `callsVsPuts`, `outcomes` by mistake, emotion, and emotional-control band, `trend` with repeated-mistake runs,
  weekly rows and a first-half against second-half comparison, `adherence` flagging option trades that missed
  Window, Size, Plan, Stop, or Exit, and `working` groups with at least 5 trades and a profit), plus the newest 300
  `trades` and `journalEntries` (linked by `ref`, notes cut at 1500 characters, with `tradesOmitted` and
  `journalEntriesOmitted` saying how many were left out), `dailyPlans`, and `strategies`. The app works out every
  figure and Claude quotes them (`reviewCoach.js`: the system prompt opens with Joel's own wording, answers as
  structured output through a Zod schema). The setup rules the coach judges against are `setupRules.js`, a
  paraphrase of `docs/private/setups.md` so they exist on a deploy (the lockout windows, contract range, and time
  stop are read from `settings.js`); keep it in step with the spec by hand. Rule adherence covers option trades
  only, as the dashboard's does, and counts trades with no review apart when it rates mistakes (a trade
  never reviewed says nothing about mistakes).
- Trading setups and detector rules: `docs/private/setups.md` (git-ignored). Read it before building any detector, gate, or review feature.
- After each commit, run the reviewer subagent on it and address every FIX before starting the next commit.

## Domain rules

- A trade is a plan until `opened_at` is set and closed once `closed_at` is set. Status is derived,
  never stored.
- Store facts, compute metrics: P/L, R-multiples, MAE/MFE, and expectancy are calculated, not stored.
- A stock or crypto plan requires an initial stop on the losing side of the planned entry (R is
  measured from it). Options are exited by hand, so their stop is optional; without one, R stays
  blank and only P/L shows. A stop that is given must be on the losing side. A target is optional
  and must be on the winning side.
- For options, prices are premiums and `multiplier` defaults to 100. "Long" means the contract was
  bought. The symbol is the underlying (SPY), with the contract in `option_type` (call/put), `strike`,
  and `expiration` (a `YYYY-MM-DD` date string; never parse it with `new Date()`, which shifts it a
  day west of UTC). Plans for options require all three; stocks and crypto may not have them.
- Journal entry kinds: `plan`, `review`, `thesis`. A thesis needs a symbol. Emotions and mistakes
  come from the fixed lists in `src/lib/journalEntry.js`; a new entry can't take a `RETIRED_MISTAKES` one
  (`entered_in_lockout`, now computed as Window OK), which old entries still show by its label.
- Deleting a trade never deletes its journal entries; the link is set to null.
- Every trade has a `mode`: `live`, `paper`, or `backtest`. So does every journal entry: one linked to
  a trade is saved with the trade's mode (and keeps it if the trade is deleted); one with no trade
  names its own, live by default (the review form asks only when no trade is picked).

## Roadmap

1. Done: journal page (`/journal`) listing entries with their linked trade, plus forms to log a
   plan and a review.
2. Done: voice journal. Record in the browser, transcribe with ElevenLabs speech-to-text (Scribe, with
   watchlist tickers as keyterms), structure the transcript into a plan or review, validate it with
   `parseTradePlan` / `parseJournalEntry`, let me confirm, then save. Plus a weekly review written by
   Claude and shown as text (I decided against reading it aloud with ElevenLabs text-to-speech).
3. Done: trade lifecycle and metrics. Record a plan's entry fill and its exit from the journal, and
   compute P/L and R-multiples from them (`src/lib/tradeMetrics.js`). No partial fills or scaling
   in and out yet: one entry and one exit per trade.
4. Polish, roughly in this order:
   - Done: mistake cost ledger (first on `/insights`, now under Performance's Discipline): total and average R per mistake tag, against
     trades with no mistakes.
   - Done for stocks: MAE/MFE computed from Alpaca bars, shown on journal trades. Options and
     crypto later.
   - Done: warnings from the trader's own history, shown while writing a plan (symbol, side, time of
     day, and days to expiration for options).
   - Done, still being tried out: circuit breakers the trader sets (daily max loss in R, max trades
     per day, cool-down after consecutive losses). Entries are blocked with an override that's
     recorded on the trade.
   - Done: strategies, rules, and a pre-entry checklist (`trade_rule_checks`), with a comparison on
     `/insights` of results when every rule was met against entries made anyway.
   - Done for options: imports from Schwab/thinkorswim account statement CSVs on `/import`, filling in
     matching hand-recorded trades and creating the rest. Stock rows and a Fidelity import (where the
     stock swing trades are) later.
   - Done: option contract fields for single calls and puts (I don't trade spreads; no legs table).
   - Done (except sector trend, earnings and ex-dividend dates, IV rank): context snapshot saved with
     each trade at entry: SPY/QQQ trend; VIX level and direction;
     macro calendar events (FOMC, CPI, jobs report); sector ETF trend and the stock's relative
     strength; days to earnings and ex-dividend dates; options context (IV rank, expected move,
     days to expiration, bid-ask spread, open interest); time of day, pre-market gap, and relative
     volume. Store it at entry, since values like IV rank can't be reliably reconstructed later.
     VIX and the earnings and economic calendars need a data source beyond Alpaca. Plan: Alpaca for
     market data, Cboe's free daily VIX history (prior close), and the published Fed/BLS schedules for
     FOMC, CPI, and jobs dates. TradingView has no data API.
   - Done: delete a journal entry from `/journal`, with a confirmation. A plan whose trade has a fill
     can't be deleted (editing one isn't built yet); a plan never filled goes with its trade.
   - Done: dark mode, following the system setting, with a picker in the nav to override it.
   - Done: setup detectors, gates, voice flows, and the entry and exit review, following the build
     order in `docs/private/setups.md` (steps 1 to 11, the coaching pass included).
   - Done: Performance Review (a tab on `/performance`), an aggregate coach over a date range (separate from the
     per-trade coaching).
5. Last, once the product is polished: deploy to Vercel plus Neon (Postgres 17). Done: Next.js
   upgraded to 16.4.1 for the security advisories. Two deployments of the same code:
   - Mine, behind auth: one password from an env var, a login page, and a signed httpOnly session
     cookie (Web Crypto HMAC, no auth library) checked in `src/proxy.js` for every page and API
     route. The password is long and random, and failed sign-ins are counted in Postgres (5 per IP
     per 15 minutes), since the in-memory `rateLimit.js` doesn't hold across Vercel instances.
   - A public demo (`NEXT_PUBLIC_DEMO_MODE`), with its own Neon database seeded with fake trades: no sign-in,
     read-only (mutating requests answer 403, so no uploads), and no live Claude or ElevenLabs
     calls (seeded reviews carry stored coaching; voice and the weekly review are hidden). Reviews
     and MAE/MFE still read Alpaca bars, so the demo needs Alpaca keys and the fake trades use
     real symbols at real trading times.

   Done in code: both deployments, steps in `docs/deploy.md` (setting up Neon and Vercel is still to
   do), and the Playwright test of the main flow (`npm run test:e2e`).
6. Performance dashboard: docs/private/dashboard.md (git-ignored).

## Gotchas

- `npm install` of a vitest version crashes npm 10 with `Cannot read properties of null (reading
  'edgesOut')`. Run that install with `npx npm@11.21.0 install ...`; `npm ci` with npm 10 is fine.
- "No test files found" from `npm run test:db` usually means the global setup could not reach
  Postgres. Check `docker compose ps`.
- Docker runs on Colima, not Docker Desktop.
- In jsdom tests, an upload with a `Blob` hangs: jsdom's `Blob` and `FormData` can't be read by
  Node's `fetch`. Stub both with Node's, as `VoiceNote.test.jsx` does.
- `@next/env`'s `loadEnvConfig` skips `.env.local` when `NODE_ENV` is `test`, so code run under
  Vitest never sees the real API keys. To try something against live APIs, pass the keys in
  explicitly.
- ESLint stays on 9: `eslint-config-next` 16 crashes on ESLint 10. Next 16 removed `next lint`,
  so the lint script runs `eslint .`.
- `eslint-config-next` turns `no-undef` off (it expects TypeScript); `eslint.config.mjs` turns it back
  on with browser and Node globals from `globals`. Tests import `describe`, `it`, etc. from `vitest`
  rather than relying on Vitest's globals.
- Next 16 error boundaries get `{ error, retry }`; `retry()` refetches and re-renders. `reset()` is the
  older, rarely wanted variant.

## Working efficiently

Context is the budget. Follow these in every session.

- **Read narrowly.** Open only the files the current commit touches. When a spec is relevant,
  read the named section, not the whole file. Never read a file "for context" without a
  specific question it answers.
- **Search before reading.** Use grep or glob to find the lines that matter, then open just
  those. Don't scan whole directories.
- **One commit at a time.** If the request implies several commits, say so, do the first, and
  stop. Don't start the next without being asked.
- **Don't echo code.** Never paste a file's contents, a full diff, or long tool output back
  into the conversation. Name the file and line and describe the change in a sentence.
- **Summaries are short.** After each commit: what changed, why, and anything I should check,
  in a few lines. No bullet-by-bullet walkthroughs unless I ask.
- **Delegate the reviewer.** Run the reviewer subagent on the commit. It reads the diff in its
  own context, so don't re-read or re-explain the diff yourself afterward — just report its
  verdict and act on FIX items.
- **Don't re-verify what CI covers.** Lint, tests, and build run in CI and I run them locally.
  Run them when a commit needs proof it's green, not repeatedly while iterating.
- **Ask before exploring.** If a task would need reading more than a handful of files, say
  what you'd need to read and why, and wait.
- **Prefer edits to rewrites.** Change the lines that need changing; don't rewrite whole files.
- **Stop at done.** When the commit is made and reported, end the turn. No proactive next
  steps, cleanups, or refactors I didn't ask for.
- **Flag the session boundary.** When a commit finishes a roadmap item, or the session has run
  several commits, end your summary with one line: "Good point to start a fresh session." Say
  which model fits the next item: the smaller one for tests, CRUD, refactors, and docs; the
  stronger one for detectors, data modeling, and design.
- **Signal the model and effort I should use.** Before starting a roadmap item or any sizable
  piece of work, open with one line: what you're about to do, and the model and effort that fit
  it. Use this mapping:
  - Sonnet, medium effort: tests, CRUD, API routes, refactors, docs, parsers, UI wiring
  - Sonnet, high effort: detectors and other intricate logic that is fully specified in a spec file
  - Opus, high effort: data modeling, ambiguous design decisions, the visual design pass

  Then wait for me to confirm or switch before you start. If I'm already on a heavier setting
  than the work needs, say so — cheaper is the default, and only flag heavier when the task is
  genuinely ambiguous.
