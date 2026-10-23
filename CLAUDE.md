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
- `npm run test:unit`: unit and component tests (no database needed)
- `npm run test:db`: database integration tests (needs Postgres running)
- `npm run test:run`: all tests
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
- Ask before pushing.
- New dependencies: pin to a release at least two weeks old.

## Architecture

- `src/lib/`: pure logic with unit tests (bars, correlation, risk, timeframes, `tradePlan`,
  `journalEntry`, `tradeFill`, `tradeMetrics`, `mistakeLedger`, `excursions`, `historyWarnings`,
  `circuitBreakers`, `circuitBreakerSettings`, `strategy`, `checklistReport`, `format`, shared `symbol` validation). Validation uses Zod 4 and returns `safeParse` results.
- `src/db/schema.js`: Drizzle schema. Migrations live in `drizzle/` (generated and committed,
  including `meta/`). Never hand-edit a migration that has been applied.
- `src/lib/context/`: pure pieces of the entry context snapshot (indicators, macro calendar, VIX,
  option helpers, `buildContext`).
- `src/server/`: server-only fetchers that call outside services (`marketContext.js`), tested with
  MSW in the node environment.
- `src/db/journal.js`, `trades.js`, `settings.js`, `strategies.js`, and `contexts.js`: repository
  functions. They take `db` as the first argument so tests can
  pass the test database.
- `src/db/index.js`: `getDb()`, created lazily (builds need no database) and cached on `globalThis`.
- `src/app/api/*/route.js`: route handlers. Invalid input returns 400 with `{ error, fieldErrors }`.
  Every handler is wrapped in `withErrorLogging(route, handler)`, so an uncaught error is logged and
  answered with 500 `{ error, requestId }`, never Next's default error page.
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
  of fees, times the multiplier) and R; 1R is measured from the entry fill once there is one.
- MAE/MFE: `GET /api/trades/[id]/excursions` fetches Alpaca bars (IEX feed, `adjustment: raw` to
  match fill prices) from the start of the bar holding the fill to the exit, or to now while open;
  `barWindow` picks minute, hourly, or daily bars by holding time. Stocks only so far. Computed on
  demand, never stored; a closed trade's bars are cached for a day.
- Insights (`/insights`): history-based views. `MistakeLedger.jsx` loads `GET /api/insights/mistakes`
  (`?mode=` optional), built from `listClosedTradesWithMistakes` and `mistakeLedger`: per mistake,
  the closed trades tagged with it (on any of their entries, once per trade) and their total and
  average R, plus the average R of trades with no mistakes as a baseline.
  `ChecklistReport.jsx` loads `GET /api/insights/checklist` (`?mode=` optional), built from
  `listClosedTradesWithRuleChecks` and `checklistReport`: closed checklist trades with every rule met
  against those entered anyway, and per rule how often it was skipped and its average R when skipped
  and when met. Rules are grouped by id (named by their latest text); deleted rules by their text.
- History warnings: `HistoryWarnings.jsx` in the plan form asks `GET /api/insights/warnings` (mode,
  direction, assetClass, symbol; debounced) and lists what `historyWarnings` finds in closed trades of
  the same mode: same symbol, same direction and asset class, and same part of the New York session
  as now (open, midday, close). Each rule uses the 20 most recent matches and warns only with at least
  5 averaging -0.3R or worse. Option plans add days-to-expiration rules (0DTE, 1-7, 8+ DTE at entry,
  New York date), alone and with the session part. Tests that render `PlanForm` must serve that route
  and `/api/strategies` (MSW errors on unhandled requests).
- Circuit breakers: settings live in `circuit_breaker_settings` (one row, id 1; a null limit is off;
  `modes` they apply to, live by default), edited in `CircuitBreakers.jsx` on `/insights` through
  `GET`/`PUT /api/circuit-breakers`. `circuitBreakers` checks today's closed R (New York day), today's
  entries, and the losing streak. `POST /api/trades/[id]/entry` answers 409 `{ error, breakers }`
  while one is tripped for the trade's mode; resending with `override: true` records the entry and
  stores the breakers in `trades.overridden_breakers`. Plans and exits are never blocked.
- Strategies and the entry checklist: `strategies` with ordered `strategy_rules` (kind `edge` for the
  setup or `discipline` for risk and process), edited on `/strategies` (`Strategies.jsx`, `GET`/`POST
  /api/strategies`, `PUT /api/strategies/[id]`). Editing keeps the ids of rules sent back with one.
  A plan may name its `strategyId`; recording its entry then needs `ruleChecks` ({ ruleId: met } for
  every rule), saved in `trade_rule_checks` with a copy of the rule's text. Unmet rules get a 409
  `{ unmetRules }` (alongside any `breakers`) and `override: true` records the entry anyway.
- Context snapshot: after `POST /api/trades/[id]/entry` responds, `after()` runs `captureContext`
  (Alpaca daily and minute bars for SPY, QQQ, and the symbol, split-adjusted and only bars that ended
  before the fill; Cboe's daily VIX file; for options Alpaca's contract open interest and indicative
  snapshot) and saves it in `trade_contexts` (JSON with a `version`; first snapshot wins). A failing
  source is logged and left null. Live option values are kept only within 15 minutes of the fill.
  `TradeContext.jsx` shows it on demand via `GET /api/trades/[id]/context`. Entry route tests mock
  `after` and `captureContext`. Macro dates in `src/lib/context/macroCalendar.js` cover 2026-10-22
  through 2027-12-31 (BLS blocks automated requests); extend them yearly.
- Weekly review: `WeeklyReview.jsx` (top of `/journal`) posts to `POST /api/weekly-review` on demand,
  not with SWR, since each review is a paid Claude call. The route sends the past seven days of entries
  (`src/lib/weeklyReview.js`, dates in New York time) to Claude and returns `{ review, entryCount }` as
  plain text, or a null review without calling Claude when the week is empty. Closed trades come
  with a computed Result line (P/L and R) that Claude quotes; it's told not to compute figures
  itself. Text only, no text-to-speech.

## Domain rules

- A trade is a plan until `opened_at` is set and closed once `closed_at` is set. Status is derived,
  never stored.
- Store facts, compute metrics: P/L, R-multiples, MAE/MFE, and expectancy are calculated, not stored.
- A plan requires an initial stop on the losing side of the planned entry (R is measured from it).
  A target is optional and must be on the winning side.
- For options, prices are premiums and `multiplier` defaults to 100. "Long" means the contract was
  bought. The symbol is the underlying (SPY), with the contract in `option_type` (call/put), `strike`,
  and `expiration` (a `YYYY-MM-DD` date string; never parse it with `new Date()`, which shifts it a
  day west of UTC). Plans for options require all three; stocks and crypto may not have them.
- Journal entry kinds: `plan`, `review`, `thesis`. A thesis needs a symbol. Emotions and mistakes
  come from the fixed lists in `src/lib/journalEntry.js`.
- Deleting a trade never deletes its journal entries; the link is set to null.
- Every trade has a `mode`: `live`, `paper`, or `backtest`.

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
   - Done: mistake cost ledger on `/insights`: total and average R per mistake tag, against
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
   - Imports from Schwab/thinkorswim CSV exports, filling in fills on matching hand-recorded trades
     (same symbol, direction, mode, close in time) and creating the rest. Waiting on a sample export.
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
5. Last, once the product is polished: deploy to Vercel plus Neon (Postgres 17). Upgrade Next.js
   past 16.4.0 first (security advisories; 16.4.1 is two weeks old on 2026-10-28). Add auth or a
   demo mode before any journal data is public. One Playwright end-to-end test of the main flow.

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
