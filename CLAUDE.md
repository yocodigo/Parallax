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
  `journalEntry`, shared `symbol` validation). Validation uses Zod 4 and returns `safeParse` results.
- `src/db/schema.js`: Drizzle schema. Migrations live in `drizzle/` (generated and committed,
  including `meta/`). Never hand-edit a migration that has been applied.
- `src/db/journal.js`: repository functions. They take `db` as the first argument so tests can
  pass the test database.
- `src/db/index.js`: `getDb()`, created lazily (builds need no database) and cached on `globalThis`.
- `src/app/api/*/route.js`: route handlers. Invalid input returns 400 with `{ error, fieldErrors }`.
- `src/components/`: client components. They load data with SWR using `fetchJson` from `src/lib/`.
  Forms post to the API and leave validation to the server, showing its `fieldErrors` under each
  input (`Field.jsx`); after saving they call `mutate('/api/journal')` to reload the list.
- Tests live in `__tests__` folders next to the code they test.
  - Database tests are named `*.db.test.js`, run against the `parallax_test` database (migrated once
    per run, tables truncated before each test), in a single fork.
  - Route tests call the handlers directly and swap in the test database with `vi.mock('@/db', ...)`.
  - Component tests use Testing Library and MSW; see `PriceChart.integration.test.jsx`.

## Domain rules

- A trade is a plan until `opened_at` is set and closed once `closed_at` is set. Status is derived,
  never stored.
- Store facts, compute metrics: P/L, R-multiples, MAE/MFE, and expectancy are calculated, not stored.
- A plan requires an initial stop on the losing side of the planned entry (R is measured from it).
  A target is optional and must be on the winning side.
- For options, prices are premiums and `multiplier` defaults to 100. "Long" means the contract was
  bought.
- Journal entry kinds: `plan`, `review`, `thesis`. A thesis needs a symbol. Emotions and mistakes
  come from the fixed lists in `src/lib/journalEntry.js`.
- Deleting a trade never deletes its journal entries; the link is set to null.
- Every trade has a `mode`: `live`, `paper`, or `backtest`.

## Roadmap

1. Done: journal page (`/journal`) listing entries with their linked trade, plus forms to log a
   plan and a review.
2. Voice journal: record in the browser, transcribe with ElevenLabs speech-to-text (Scribe, with
   watchlist tickers as keyterms), structure the transcript into a plan or review, validate it with
   `parseTradePlan` / `parseJournalEntry`, let me confirm, then save. Later: a weekly audio review
   read back with ElevenLabs text-to-speech.
3. Deploy: Vercel plus Neon (Postgres 17). Add auth or a demo mode before any journal data is
   public. One Playwright end-to-end test of the main flow.
4. Later:
   - Strategies, rules, and a pre-entry gate checklist (`trade_rule_checks`).
   - Warnings from the trader's own history, shown at entry. Example: "Your last 8 0DTE entries
     after 3:30 PM averaged -0.7R."
   - Circuit breakers the trader sets: a daily max loss, a max number of trades per day, and a
     cool-down after consecutive losses.
   - Mistake cost ledger: total R lost per mistake tag, showing which habit to fix first.
   - Context snapshot saved with each trade at entry: SPY/QQQ trend; VIX level and direction;
     macro calendar events (FOMC, CPI, jobs report); sector ETF trend and the stock's relative
     strength; days to earnings and ex-dividend dates; options context (IV rank, expected move,
     days to expiration, bid-ask spread, open interest); time of day, pre-market gap, and relative
     volume. Store it at entry, since values like IV rank can't be reliably reconstructed later.
     VIX and the earnings and economic calendars need a data source beyond Alpaca.
   - MAE/MFE computed from Alpaca bars.
   - Imports from Alpaca and broker CSVs.
   - A legs table for vertical spreads.

## Gotchas

- `fileParallelism` is ignored inside a Vitest project; the `db` project uses a single fork instead.
- "No test files found" from `npm run test:db` usually means the global setup could not reach
  Postgres. Check `docker compose ps`.
- Docker runs on Colima, not Docker Desktop.
- ESLint stays on 9: `eslint-config-next` 16 crashes on ESLint 10. Next 16 removed `next lint`,
  so the lint script runs `eslint .`.
