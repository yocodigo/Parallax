import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import PerformanceDashboard from '../PerformanceDashboard';

// The page's default year is the New York one, which differs from the local year around New Year's.
const nyYear = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date());

const summary = (extra = {}) => ({
  trades: 5,
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
  adherence: {},
  violationCosts: {
    followed: { trades: 0, cents: 0 },
    window: { trades: 0, cents: 0 },
    size: { trades: 0, cents: 0 },
    both: { trades: 0, cents: 0 },
  },
  equity: [
    { closedAt: '2026-03-10T20:00:00.000Z', cumulative: 30, drawdown: 0 },
    { closedAt: '2026-04-13T20:00:00.000Z', cumulative: 18.7, drawdown: 11.3 },
  ],
  rolling: [],
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

function renderDashboard() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <PerformanceDashboard />
    </SWRConfig>
  );
}

describe('PerformanceDashboard', () => {
  it('shows the headline strip, each figure labelled net or gross, above the charts', async () => {
    servePerformance();
    renderDashboard();

    expect(await screen.findByText('Net P/L (net)')).toBeInTheDocument();
    expect(screen.getByText('+$18.70')).toBeInTheDocument();
    expect(screen.getByText('Win rate (gross P/L)')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('Profit factor (net)')).toBeInTheDocument();
    expect(screen.getByText('1.80')).toBeInTheDocument();
    expect(screen.getByText('Expectancy (net)')).toBeInTheDocument();
    expect(screen.getByText('+$3.74')).toBeInTheDocument();
    // The last point of the equity curve is 11.30 below its peak.
    expect(screen.getByText('Drawdown (net)')).toBeInTheDocument();
    expect(screen.getByText('-$11.30')).toBeInTheDocument();
  });

  it('puts the equity curve first, then the grid of charts', async () => {
    servePerformance();
    renderDashboard();

    const headings = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent);
    expect(headings).toEqual([
      'Equity curve',
      'Net P/L by month',
      'Mistake cost ledger',
      'Expectancy, last 20 trades',
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

  it('shows a prompt with an Import link instead of empty axes when nothing has closed', async () => {
    servePerformance(body({ yearToDate: summary({ trades: 0 }), equity: [] }));
    renderDashboard();

    expect(await screen.findByText(/No closed trades/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Import trades' })).toHaveAttribute('href', '/import');
    expect(screen.queryByRole('heading', { name: 'Equity curve' })).not.toBeInTheDocument();
    // The filters stay, so another mode or year can be tried.
    expect(screen.getByLabelText('Mode')).toBeInTheDocument();
  });

  it('shows the API error instead of the dashboard', async () => {
    server.use(
      http.get('*/api/insights/performance', () => HttpResponse.json({ error: 'Invalid query' }, { status: 400 }))
    );
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid query');
  });
});
