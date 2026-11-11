import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import PerformanceReview from '../PerformanceReview';

const SECTIONS = {
  strengths: 'Band cross made money on Mondays.',
  patternsToFix: 'Oversized on Apr 9 and Apr 10.',
  ruleAdherence: 'Two lockout entries.',
  emotionalPatterns: 'Frustration came with revenge trades.',
  recommendations: 'Cap size at 2 contracts.',
};

const saved = {
  sections: SECTIONS,
  reviewedAt: '2026-04-14T20:30:00.000Z',
  tradeCount: 15,
  rangeFrom: '2026-04-08',
  rangeTo: '2026-04-14',
};

const overview = (overrides = {}) => ({
  range: { key: '7d', label: 'Last 7 days', fromDay: '2026-04-08', toDay: '2026-04-14' },
  stats: {
    live: { trades: 10, wins: 6, losses: 4, scratches: 0, winRatePct: 60, netPnl: 125.5, avgNetPnl: 12.55 },
    backtest: { trades: 5, wins: 2, losses: 3, scratches: 0, winRatePct: 40, netPnl: -30, avgNetPnl: -6 },
  },
  tradeCount: 15,
  review: null,
  ...overrides,
});

// Serve the overview and record the query each request asked for.
function serveOverview(body = overview()) {
  const queries = [];
  server.use(
    http.get('*/api/insights/review', ({ request }) => {
      queries.push(Object.fromEntries(new URL(request.url).searchParams));
      return HttpResponse.json(body);
    })
  );
  return queries;
}

function servePost(response) {
  const bodies = [];
  server.use(
    http.post('*/api/insights/review', async ({ request }) => {
      bodies.push(await request.json());
      return response();
    })
  );
  return bodies;
}

function renderReview() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <PerformanceReview />
    </SWRConfig>
  );
}

afterEach(() => vi.unstubAllEnvs());

describe('PerformanceReview', () => {
  it('shows each mode’s trades, win rate, P/L, and average, never added together', async () => {
    serveOverview();
    renderReview();

    const table = await screen.findByRole('table', { name: /closed trades by mode/i });
    const live = within(within(table).getByRole('row', { name: /live/i }));
    expect(live.getByText('10')).toBeInTheDocument();
    expect(live.getByText('60.0%')).toBeInTheDocument();
    expect(live.getByText('+$125.50')).toBeInTheDocument();
    expect(live.getByText('+$12.55')).toBeInTheDocument();
    const backtest = within(within(table).getByRole('row', { name: /backtest/i }));
    expect(backtest.getByText('-$30.00')).toBeInTheDocument();
    // The header and one row per mode: no row adds the modes together.
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });

  it('asks for the last 7 days first, and for the range chosen', async () => {
    const queries = serveOverview();
    const user = userEvent.setup();
    renderReview();
    await screen.findByRole('table');
    expect(queries[0]).toEqual({ range: '7d' });

    await user.selectOptions(screen.getByLabelText(/range/i), 'all');

    await screen.findByRole('table');
    expect(queries.at(-1)).toEqual({ range: 'all' });
    expect(within(screen.getByLabelText(/range/i)).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Last 7 days',
      'Last 30 days',
      'All time',
      'Custom range',
    ]);
  });

  it('asks for a custom range only once both dates are set and in order', async () => {
    const queries = serveOverview();
    const user = userEvent.setup();
    renderReview();
    await screen.findByRole('table');
    await user.selectOptions(screen.getByLabelText(/range/i), 'custom');
    const requestsBefore = queries.length;

    fireEvent.change(screen.getByLabelText(/^from/i), { target: { value: '2026-04-10' } });
    expect(queries).toHaveLength(requestsBefore);

    fireEvent.change(screen.getByLabelText(/^to/i), { target: { value: '2026-04-01' } });
    expect(await screen.findByText(/from date is after the to date/i)).toBeInTheDocument();
    expect(queries).toHaveLength(requestsBefore);

    fireEvent.change(screen.getByLabelText(/^to/i), { target: { value: '2026-04-12' } });
    await screen.findByRole('table');
    expect(queries.at(-1)).toEqual({ range: 'custom', from: '2026-04-10', to: '2026-04-12' });
  });

  it('shows the saved review under its five headings, with when it was written and what it covers', async () => {
    serveOverview(overview({ review: saved }));
    renderReview();

    for (const heading of ['Strengths', 'Patterns to Fix', 'Rule Adherence', 'Emotional Patterns', 'Recommendations for This Week']) {
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText(/cap size at 2 contracts/i)).toBeInTheDocument();
    expect(screen.getByText(/written apr 14, 2026, 4:30 pm et from 15 closed trades, 2026-04-08 to 2026-04-14/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh analysis/i })).toBeInTheDocument();
  });

  it('offers to write a review when there is none, without calling Claude until pressed', async () => {
    serveOverview();
    const bodies = servePost(() => HttpResponse.json({ review: saved }));
    renderReview();

    expect(await screen.findByText(/no review written for this range yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /write review/i })).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it('writes the review for the range, shows it, and then offers a refresh', async () => {
    serveOverview();
    const bodies = servePost(() => HttpResponse.json({ review: saved }));
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByRole('button', { name: /write review/i }));

    expect(await screen.findByText(/cap size at 2 contracts/i)).toBeInTheDocument();
    expect(bodies).toEqual([{ range: '7d' }]);
    expect(screen.getByRole('button', { name: /refresh analysis/i })).toBeInTheDocument();
  });

  it('sends the dates of a custom range', async () => {
    serveOverview();
    const bodies = servePost(() => HttpResponse.json({ review: saved }));
    const user = userEvent.setup();
    renderReview();
    await screen.findByRole('table');
    await user.selectOptions(screen.getByLabelText(/range/i), 'custom');
    fireEvent.change(screen.getByLabelText(/^from/i), { target: { value: '2026-04-01' } });
    fireEvent.change(screen.getByLabelText(/^to/i), { target: { value: '2026-04-12' } });

    await user.click(await screen.findByRole('button', { name: /write review/i }));

    await screen.findByText(/cap size at 2 contracts/i);
    expect(bodies).toEqual([{ range: 'custom', from: '2026-04-01', to: '2026-04-12' }]);
  });

  it('says it is writing, and cannot be pressed twice', async () => {
    serveOverview(overview({ review: saved }));
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    servePost(async () => {
      await gate;
      return HttpResponse.json({ review: saved });
    });
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByRole('button', { name: /refresh analysis/i }));

    expect(screen.getByRole('button', { name: /writing/i })).toBeDisabled();
    release();
    expect(await screen.findByRole('button', { name: /refresh analysis/i })).toBeEnabled();
  });

  it("shows the server's error with its reference, and keeps the earlier review", async () => {
    serveOverview(overview({ review: saved }));
    servePost(() => HttpResponse.json({ error: "Couldn't write the review. Try again.", requestId: 'req-9' }, { status: 502 }));
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByRole('button', { name: /refresh analysis/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't write the review.*req-9/i);
    expect(screen.getByText(/cap size at 2 contracts/i)).toBeInTheDocument();
  });

  it('says so when no trade closed in the range, with nothing to write a review of', async () => {
    serveOverview(overview({ stats: {}, tradeCount: 0 }));
    renderReview();

    expect(await screen.findByText(/no closed trades in this range/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /write review/i })).not.toBeInTheDocument();
  });

  it('says why when the server finds nothing to review', async () => {
    serveOverview();
    servePost(() => HttpResponse.json({ review: null, reason: 'No closed trades in this range' }));
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByRole('button', { name: /write review/i }));

    expect(await screen.findByText(/no closed trades in this range\./i)).toBeInTheDocument();
  });

  it('shows an error when the overview cannot be loaded', async () => {
    server.use(http.get('*/api/insights/review', () => HttpResponse.json({ error: 'Request failed' }, { status: 500 })));
    renderReview();

    expect(await screen.findByRole('alert')).toHaveTextContent(/request failed/i);
  });

  it('in the demo, shows a stored review but has no button to write one', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
    serveOverview(overview({ review: saved }));
    renderReview();

    expect(await screen.findByText(/cap size at 2 contracts/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /analysis|write review/i })).not.toBeInTheDocument();
  });

  it('in the demo, says no review is stored when there is none', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
    serveOverview();
    renderReview();

    expect(await screen.findByText(/no review is stored for this range/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /write review/i })).not.toBeInTheDocument();
  });
});
