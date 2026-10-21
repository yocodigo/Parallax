# Parallax

[![CI](https://github.com/yocodigo/Parallax/actions/workflows/ci.yml/badge.svg)](https://github.com/yocodigo/Parallax/actions/workflows/ci.yml)

A portfolio-aware market data dashboard built on the [Alpaca APIs](https://docs.alpaca.markets/). It charts price history for a set of symbols, surfaces how those symbols move together, and — when connected to an account with open positions — describes the concentration and risk profile of the portfolio itself.

The emphasis is analytical, not advisory: the app describes properties of the data and the portfolio (returns, correlation, concentration, unrealized P&L). It does not generate trade signals or recommendations.

Built with Next.js 16 (App Router), Tailwind, SWR, and Recharts. Tested with Vitest, React Testing Library, and MSW, with lint, tests, and build running in CI on every push.

## What works today

**Market data**
- **`/api/bars`** — server-side route that authenticates against Alpaca and pulls bars for up to 10 symbols at the selected timeframe, from 1-minute to monthly. Credentials stay server-side and are never exposed to the browser. Request parameters are validated with a Zod schema; responses are cached with a revalidation window to reduce load on the upstream API.
- **Multi-symbol chart** — per-symbol closes merged into a single time-ordered series and rendered as an overlaid line chart.
- **Summary cards** — latest close and percent change over the selected window for each symbol.
- **Return correlation heatmap** — pairwise Pearson correlation of daily returns across the selected symbols, so you can see which names move together over the window.
- **Adjustable inputs** — comma-separated symbol list and a 30 / 90 / 180 / 365-day window.

**Portfolio**
- **`/api/positions`** — server-side route that fetches the account's open positions from the Alpaca trading API and derives concentration metrics. Defaults to the paper trading host; configurable via environment variable.
- **Risk panel** — per-position weight by market value, unrealized P&L, and a callout for the single largest holding (concentration risk).

**Cross-cutting**
- Input validation at the route boundary (Zod).
- In-memory rate limiting on the API routes (sufficient for a small demo; see notes below).
- Upstream error details are logged server-side and not leaked to the client.

## Architecture

Pure logic lives in `src/lib/` and is unit-tested in isolation from the routes and UI:

- `bars.js` — reshapes raw Alpaca bars into a charting series and computes per-symbol summaries.
- `correlation.js` — daily returns and the pairwise correlation matrix.
- `risk.js` — volatility (standard deviation) and portfolio concentration by market value.
- `positions.js` — maps Alpaca's string-typed position fields into a numeric, camelCase shape.
- `params.js` — request parameter validation.
- `rateLimit.js` — fixed-window rate limiter.
- `timeframes.js` — supported timeframes, their maximum windows, and window clamping.

Route handlers in `src/app/api/` stay thin: authenticate, fetch, delegate to `lib/`, return JSON. Components in `src/components/` are presentational and fetch through SWR.

## Testing

```bash
npm test          # watch mode
npm run test:run  # single run
npm run lint      # ESLint
```

Unit tests cover the deterministic core (bar reshaping, correlation, risk, parameter validation, and timeframes). An integration test drives the chart component against MSW-mocked API responses to verify what it actually requests and renders.

## Setup

Requires Node 20.9+, Docker, and an Alpaca account. Paper trading keys are free and work for both market data and positions.

```bash
npm install
cp .env.example .env.local   # then add your keys
docker compose up -d         # start Postgres
npm run db:migrate          # create tables
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Description |
| --- | --- |
| `ALPACA_KEY_ID` | Alpaca API key ID. Paper keys start with `PK`. |
| `ALPACA_SECRET_KEY` | Alpaca API secret. |
| `ALPACA_TRADING_HOST` | Trading host. `https://paper-api.alpaca.markets` (paper) or `https://api.alpaca.markets` (live). Must match the keys above. |
| `DATABASE_URL` | Postgres connection string. The `.env.example` default points at the local Docker database. |

Generate keys at https://app.alpaca.markets/ under "API Keys". Paper and live are separate environments with separate keys — a key/host mismatch returns HTTP 401.

> The positions panel shows "No open positions" until the connected account holds some. On a paper account, open a few positions from the Alpaca dashboard to populate the risk and correlation views.

## Not built yet

- Order submission and lifecycle tracking
- Persistence (no database — every request hits Alpaca live)
- Correlation weighted by actual position sizes (portfolio-weighted, not just symbol-level)
- Watchlists
- Backtesting
- Financial news and geopolitical feeds

## Notes and limitations

- **Rate limiting is in-memory and per-process** — fine for local use and a small demo. For real deployment across serverless instances, back it with a shared store (e.g. Redis).
- **Data feed** — uses Alpaca's IEX feed, which is delayed. The chart window ends yesterday to avoid requesting bars that don't exist yet.
- **Not investment advice** — the app surfaces descriptive statistics about market data and a portfolio. It does not recommend trades.