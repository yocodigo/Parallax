import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import PerformanceDashboard from '../PerformanceDashboard';

// The page's default year is the New York one, which differs from the local year around New Year's.
const nyYear = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date());

const summary = (extra = {}) => ({
  trades: 5,
  wins: 3,
  losses: 2,
  scratches: 0,
  avgWin: 15,
  avgLoss: -12.5,
  grossPnl: 20,
  netPnl: 18.7,
  winRate: 0.6,
  profitFactor: 2,
  netProfitFactor: 1.8,
  expectancy: 4,
  netExpectancy: 3.74,
  ...extra,
});

const body = (extra = {}) => ({
  months: [],
  yearToDate: summary(),
  adherence: {
    trades: 0,
    window: { ok: 0, missed: 0, cost: 0 },
    size: { ok: 0, missed: 0, cost: 0 },
    plan: { ok: 0, missed: 0, cost: 0 },
    stop: { ok: 0, missed: 0, cost: 0 },
    exit: { ok: 0, missed: 0, cost: 0 },
    discipline: { ok: 0, missed: 0, cost: null },
  },
  violationCosts: {
    followed: { trades: 0, net: 0 },
    window: { trades: 0, net: 0 },
    size: { trades: 0, net: 0 },
    both: { trades: 0, net: 0 },
  },
  equity: [
    { closedAt: '2026-03-10T20:00:00.000Z', cumulative: 30, drawdown: 0 },
    { closedAt: '2026-04-13T20:00:00.000Z', cumulative: 18.7, drawdown: 11.3 },
  ],
  rolling: [],
  // Every half hour of the session, as the route sends them.
  timeOfDay: Array.from({ length: 13 }, (_, i) => ({
    start: `${String(9 + Math.floor((i + 1) / 2)).padStart(2, '0')}:${i % 2 ? '00' : '30'}`,
    trades: 0,
    netPnl: 0,
  })),
  ...extra,
});

// Serve the route and record the query each request asked for.
function servePerformance(response = body()) {
  const queries = [];
  server.use(
    http.get('*/api/insights/performance', ({ request }) => {
      queries.push(Object.fromEntries(new URL(request.url).searchParams));
      return HttpResponse.json(response);
    })
  );
  return queries;
}

// The strip's labels are <dt>s; the mode table repeats some of them as row headings.
const STRIP = { selector: 'dt' };

const none = { trades: 0, winRate: null, netExpectancy: null, netProfitFactor: null, avgWin: null, avgLoss: null };
const noCell = { trades: 0, window: 0, netExpectancy: null, met: false };

// Figures that differ from the headline strip's, so a value is only ever on screen once.
const modesBody = (extra = {}) => ({
  gradN: 30,
  modes: {
    live: { trades: 8, winRate: 0.5, netExpectancy: 2.5, netProfitFactor: 1.5, avgWin: 10, avgLoss: -6 },
    paper: none,
    backtest: none,
  },
  setups: [
    {
      strategyId: 'a',
      name: 'Trend pullback',
      modes: { backtest: noCell, paper: noCell, live: { trades: 8, window: 8, netExpectancy: 2.5, met: false } },
      gap: null,
    },
  ],
  ...extra,
});

// Serve the modes route and record the query each request asked for.
function serveModes(response = modesBody(), status = 200) {
  const queries = [];
  server.use(
    http.get('*/api/insights/modes', ({ request }) => {
      queries.push(Object.fromEntries(new URL(request.url).searchParams));
      return HttpResponse.json(response, { status });
    })
  );
  return queries;
}

function renderDashboard() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <PerformanceDashboard />
    </SWRConfig>
  );
}

describe('PerformanceDashboard', () => {
  // Every test has the modes route answering; the ones about it serve their own.
  beforeEach(() => {
    serveModes();
    server.use(
      http.get('*/api/strategies', () =>
        HttpResponse.json({
          strategies: [
            { id: '5b2b1a5e-0d52-4f0e-9a39-1f6a2f7f6c11', name: 'Trend pullback' },
            { id: '9c0e7a1d-3b64-4a3c-8c70-2d1b8a6e4f22', name: 'Opening range' },
          ],
        })
      )
    );
  });

  it('shows the headline strip, each figure labelled net or gross, above the charts', async () => {
    servePerformance();
    renderDashboard();

    expect(await screen.findByText('Net P/L (net)', STRIP)).toBeInTheDocument();
    expect(screen.getByText('+$18.70')).toBeInTheDocument();
    expect(screen.getByText('Win rate (gross P/L)', STRIP)).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('Profit factor (net)', STRIP)).toBeInTheDocument();
    expect(screen.getByText('1.80')).toBeInTheDocument();
    expect(screen.getByText('Expectancy (net)', STRIP)).toBeInTheDocument();
    expect(screen.getByText('+$3.74')).toBeInTheDocument();
    // The last point of the equity curve is 11.30 below its peak.
    expect(screen.getByText('Drawdown (net)', STRIP)).toBeInTheDocument();
    expect(screen.getByText('-$11.30')).toBeInTheDocument();
  });

  it('puts the equity curve first, then the grid of charts', async () => {
    servePerformance();
    renderDashboard();

    await screen.findByRole('heading', { name: 'Graduation tracker' });
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Equity curve',
      'Drawdown',
      'Net P/L by month',
      'Mistake cost ledger',
      'Results by time of day',
      'Expectancy, last 20 trades',
      'Win rate vs breakeven',
      'Wins, losses, scratches by month',
      'Average win vs average loss',
      'Expectancy by month',
      'Profit factor by month',
      'Fees vs gross P/L',
      'Mode comparison',
      'Graduation tracker',
    ]);
  });

  it('asks for live trades of the current year, then for what the filters say', async () => {
    const queries = servePerformance();
    renderDashboard();
    await screen.findByText('Net P/L (net)');

    expect(queries[0]).toEqual({ mode: 'live', year: nyYear });

    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'paper');
    await userEvent.selectOptions(screen.getByLabelText('Asset'), 'option');
    await userEvent.selectOptions(screen.getByLabelText('Year'), '2025');

    await screen.findByText('Net P/L (net)');
    expect(queries.at(-1)).toEqual({ mode: 'paper', asset: 'option', year: '2025' });
  });

  it('offers the last six years and all years, and asks for all of them', async () => {
    const queries = servePerformance();
    renderDashboard();
    await screen.findByText('Net P/L (net)');

    const year = screen.getByLabelText('Year');
    const years = [...year.options].map((option) => option.text);
    expect(years).toHaveLength(7);
    expect(years[0]).toBe(nyYear);
    expect(years.at(-1)).toBe('All years');

    await userEvent.selectOptions(year, 'All years');
    await waitFor(() => expect(queries.at(-1)).toEqual({ mode: 'live', year: 'all' }));

    await userEvent.selectOptions(year, '2025');
    await waitFor(() => expect(queries.at(-1)).toEqual({ mode: 'live', year: '2025' }));
  });

  it('says no year had trades, not a named year, when all years come back empty', async () => {
    servePerformance(body({ yearToDate: summary({ trades: 0 }), equity: [] }));
    renderDashboard();

    await userEvent.selectOptions(await screen.findByLabelText('Year'), 'All years');

    expect(await screen.findByText(/No closed trades for these filters in any year/)).toBeInTheDocument();
  });

  it('offers every setup, and the trades taken without one, and asks for the one picked', async () => {
    const queries = servePerformance();
    renderDashboard();
    await screen.findByText('Net P/L (net)');

    const setup = screen.getByLabelText('Setup');
    await screen.findByRole('option', { name: 'Opening range' });
    expect([...setup.options].map((option) => option.text)).toEqual([
      'All setups',
      'Trend pullback',
      'Opening range',
      'No setup',
    ]);

    await userEvent.selectOptions(setup, 'Opening range');
    await waitFor(() =>
      expect(queries.at(-1)).toEqual({
        mode: 'live',
        year: nyYear,
        strategyId: '9c0e7a1d-3b64-4a3c-8c70-2d1b8a6e4f22',
      })
    );

    await userEvent.selectOptions(setup, 'No setup');
    await waitFor(() => expect(queries.at(-1).strategyId).toBe('none'));

    await userEvent.selectOptions(setup, 'All setups');
    await waitFor(() => expect(queries.at(-1)).toEqual({ mode: 'live', year: nyYear }));
  });

  it('asks for calls or puts only, and back to both', async () => {
    const queries = servePerformance();
    renderDashboard();
    await screen.findByText('Net P/L (net)');

    const side = screen.getByLabelText('Call/Put');
    expect([...side.options].map((option) => option.text)).toEqual(['Both', 'Calls', 'Puts']);

    await userEvent.selectOptions(side, 'Puts');
    await waitFor(() => expect(queries.at(-1)).toEqual({ mode: 'live', year: nyYear, optionType: 'put' }));

    await userEvent.selectOptions(side, 'Both');
    await waitFor(() => expect(queries.at(-1)).toEqual({ mode: 'live', year: nyYear }));
  });

  it('turns Call/Put off for stocks and crypto, and stops sending a pick made before', async () => {
    const queries = servePerformance();
    const modeQueries = serveModes();
    renderDashboard();
    await screen.findByText('Net P/L (net)');
    const side = screen.getByLabelText('Call/Put');

    await userEvent.selectOptions(side, 'Puts');
    await userEvent.selectOptions(screen.getByLabelText('Asset'), 'Stocks');

    expect(side).toBeDisabled();
    expect(side).toHaveValue('');
    await waitFor(() => expect(queries.at(-1)).toEqual({ mode: 'live', year: nyYear, asset: 'stock' }));
    await waitFor(() => expect(modeQueries.at(-1)).toEqual({ asset: 'stock' }));

    await userEvent.selectOptions(screen.getByLabelText('Asset'), 'Crypto');
    expect(side).toBeDisabled();

    // Options and All allow it again, and the earlier pick is back.
    await userEvent.selectOptions(screen.getByLabelText('Asset'), 'Options');
    expect(side).toBeEnabled();
    expect(side).toHaveValue('put');
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ asset: 'option', optionType: 'put' }));
    await userEvent.selectOptions(screen.getByLabelText('Asset'), 'All');
    expect(side).toBeEnabled();
  });

  it('compares the modes and tracks graduation below the charts, whatever mode the charts show', async () => {
    servePerformance();
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Mode comparison' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Graduation tracker' })).toBeInTheDocument();
    // The Setup filter lists it too, so look for the table's own cell.
    expect(screen.getByText('Trend pullback', { selector: 'td, th' })).toBeInTheDocument();
    expect(screen.getByText(/the Mode and Year filters don't apply/)).toBeInTheDocument();
  });

  it('asks the modes route for the asset, setup, and call/put picks, never the mode or the year', async () => {
    servePerformance();
    const queries = serveModes();
    renderDashboard();
    await screen.findByRole('heading', { name: 'Mode comparison' });

    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'paper');
    await userEvent.selectOptions(screen.getByLabelText('Year'), '2025');
    await userEvent.selectOptions(screen.getByLabelText('Asset'), 'option');
    await screen.findByRole('option', { name: 'Trend pullback' });
    await userEvent.selectOptions(screen.getByLabelText('Setup'), 'No setup');
    await userEvent.selectOptions(screen.getByLabelText('Call/Put'), 'Calls');

    await waitFor(() =>
      expect(queries.at(-1)).toEqual({ asset: 'option', strategyId: 'none', optionType: 'call' })
    );
    const allowed = ['asset', 'strategyId', 'optionType'];
    expect(queries.every((query) => Object.keys(query).every((key) => allowed.includes(key)))).toBe(true);
  });

  it('leaves the modes out when no trade has closed in any of them', async () => {
    servePerformance(body({ yearToDate: summary({ trades: 0 }), equity: [] }));
    const queries = serveModes(modesBody({ modes: { live: none, paper: none, backtest: none }, setups: [] }));
    renderDashboard();

    await screen.findByText(/No closed trades/);
    await waitFor(() => expect(queries.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('heading', { name: 'Mode comparison' })).not.toBeInTheDocument();
  });

  it('shows the modes route error beside the charts, which stay', async () => {
    servePerformance();
    serveModes({ error: 'Modes unavailable' }, 500);
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Modes unavailable');
    expect(screen.getByRole('heading', { name: 'Equity curve' })).toBeInTheDocument();
  });

  it('shows a prompt with an Import link instead of empty axes when nothing has closed', async () => {
    servePerformance(body({ yearToDate: summary({ trades: 0 }), equity: [] }));
    renderDashboard();

    expect(await screen.findByText(/No closed trades/)).toBeInTheDocument();
    // A narrow filter can empty the page as well as a missing import.
    expect(screen.getByText(/Try widening the filters, or import an account statement/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Import trades' })).toHaveAttribute('href', '/import');
    expect(screen.queryByRole('heading', { name: 'Equity curve' })).not.toBeInTheDocument();
    // The filters stay, so another mode or year can be tried.
    expect(screen.getByLabelText('Mode')).toBeInTheDocument();
  });

  it('opens on the Charts tab, beside a Tables tab', async () => {
    servePerformance();
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Equity curve' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Charts' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Tables' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('table', { name: 'Monthly summary' })).not.toBeInTheDocument();
  });

  it('swaps the charts and the modes for the tables, keeping the headline strip', async () => {
    servePerformance(body({ months: [{ month: '2026-03', ...summary() }] }));
    renderDashboard();
    await screen.findByRole('heading', { name: 'Equity curve' });
    await screen.findByRole('heading', { name: 'Mode comparison' });

    await userEvent.click(screen.getByRole('tab', { name: 'Tables' }));

    expect(screen.getByRole('tab', { name: 'Tables' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('table', { name: 'Monthly summary' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Totals' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Rule adherence' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Rule violations' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Equity curve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mode comparison' })).not.toBeInTheDocument();
    expect(screen.getByText('Net P/L (net)', STRIP)).toBeInTheDocument();
  });

  it('keeps the filters and asks for nothing new when switching tabs', async () => {
    const queries = servePerformance();
    renderDashboard();
    await screen.findByRole('heading', { name: 'Equity curve' });
    await userEvent.selectOptions(screen.getByLabelText('Asset'), 'option');
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ asset: 'option' }));
    const asked = queries.length;

    await userEvent.click(screen.getByRole('tab', { name: 'Tables' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Charts' }));

    expect(screen.getByLabelText('Asset')).toHaveValue('option');
    expect(await screen.findByRole('heading', { name: 'Equity curve' })).toBeInTheDocument();
    expect(queries).toHaveLength(asked);
  });

  it('shows the empty prompt on the Tables tab too', async () => {
    servePerformance(body({ yearToDate: summary({ trades: 0 }), equity: [] }));
    renderDashboard();
    await screen.findByText(/No closed trades/);

    await userEvent.click(screen.getByRole('tab', { name: 'Tables' }));

    expect(screen.getByText(/No closed trades/)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Monthly summary' })).not.toBeInTheDocument();
  });

  it('shows the API error instead of the dashboard', async () => {
    server.use(
      http.get('*/api/insights/performance', () => HttpResponse.json({ error: 'Invalid query' }, { status: 400 }))
    );
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid query');
  });
});
