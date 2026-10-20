import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import PriceChart from '../PriceChart';
import { SWRConfig } from 'swr';

// A minimal valid /api/bars response, parameterized by timeframe so we can
// prove the value flows request → response → DOM.
function barsResponse({ timeframe = '1Day' } = {}) {
  return {
    symbols: ['AAPL', 'MSFT'],
    summary: [
      { symbol: 'AAPL', last: 210.5, change: 10, changePct: 5, bars: 2 },
      { symbol: 'MSFT', last: 400.25, change: -4, changePct: -1, bars: 2 },
    ],
    series: [
      { date: '2026-01-05', AAPL: 200, MSFT: 404 },
      { date: '2026-01-12', AAPL: 210.5, MSFT: 400.25 },
    ],
    correlation: {
      AAPL: { AAPL: 1, MSFT: 0.5 },
      MSFT: { AAPL: 0.5, MSFT: 1 },
    },
    timeframe,
    window: { start: '2026-01-01', end: '2026-01-12' },
  };
}

// Record the URL of each /api/bars request the component fires.
function captureBarsRequests() {
  const urls = [];
  server.use(
    http.get('*/api/bars', ({ request }) => {
      const url = new URL(request.url);
      urls.push(url);
      const timeframe = url.searchParams.get('timeframe') || '1Day';
      return HttpResponse.json(barsResponse({ timeframe }));
    })
  );
  return urls;
}

function renderChart() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <PriceChart />
    </SWRConfig>
  );
}

describe('PriceChart request parameters', () => {
  it('sends default symbols, days, and timeframe on first load', async () => {
    const urls = captureBarsRequests();
    renderChart();

    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    const params = urls[0].searchParams;
    expect(params.get('symbols')).toBe('AAPL,MSFT,SPY');
    expect(params.get('days')).toBe('90');
    expect(params.get('timeframe')).toBe('1Day');
  });

  it('includes the selected timeframe in the request URL', async () => {
    const urls = captureBarsRequests();
    renderChart();
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));

    await userEvent.selectOptions(screen.getByLabelText('Timeframe'), '1Week');

    // The exact wiring that broke: state updated but the param was dropped.
    await waitFor(() => {
      expect(urls.some((u) => u.searchParams.get('timeframe') === '1Week')).toBe(true);
    });
  });

  it('renders returned series data after a timeframe change', async () => {
    captureBarsRequests();
    renderChart();

    await waitFor(() => {
      expect(screen.getByText('$210.50')).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByLabelText('Timeframe'), '1Month');

    // Footer reflects the timeframe the response echoed — full round trip.
    await waitFor(() => {
      expect(screen.getByText(/1Month bars from Alpaca IEX feed/)).toBeInTheDocument();
    });
  });

  it('caps the window options to the selected timeframe', async () => {
    captureBarsRequests();
    renderChart();

    await userEvent.selectOptions(screen.getByLabelText('Timeframe'), '1Min');
    const windowSelect = screen.getByLabelText('Window');
    expect(windowSelect).not.toHaveTextContent('5 years');
    expect(windowSelect).toHaveTextContent('5 days');
  });

  it('never requests a window the new timeframe does not allow', async () => {
    const urls = captureBarsRequests();
    renderChart();
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));

    // Default window is 90 days; 1-minute bars allow at most 5.
    await userEvent.selectOptions(screen.getByLabelText('Timeframe'), '1Min');

    await waitFor(() => {
    expect(urls.some((u) => u.searchParams.get('timeframe') === '1Min')).toBe(true);
    });
    const minuteDays = urls
    .filter((u) => u.searchParams.get('timeframe') === '1Min')
    .map((u) => u.searchParams.get('days'));
    expect(minuteDays).toEqual(['5']);
  });
});