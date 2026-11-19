import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import PlansNotTaken from '../PlansNotTaken';

const result = {
  rows: [],
  plans: 5,
  neverTriggered: 2,
  replayed: 3,
  summary: { trades: 3, wins: 2, losses: 1, winRate: 2 / 3, netPnl: 140.5, netExpectancy: 46.83 },
  exits: { t1: 1, backstop: 1, time_stop: 1 },
  fullCoverage: 2,
  fees: 1.3,
  feesTrades: 12,
};

const renderIt = (props) =>
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <PlansNotTaken mode="paper" year={2026} {...props} />
    </SWRConfig>
  );

describe('PlansNotTaken', () => {
  it("asks nothing until the button is pressed, then gives the replays' result in the page's mode and year", async () => {
    const urls = [];
    server.use(
      http.get('/api/insights/plans-not-taken', ({ request }) => {
        urls.push(new URL(request.url).search);
        return HttpResponse.json(result);
      })
    );
    renderIt();

    expect(urls).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Replay plans not taken' }));

    expect(await screen.findByText('5 plans were never filled: 2 never triggered, 3 replayed.')).toBeInTheDocument();
    expect(urls).toEqual(['?mode=paper&year=2026']);
    expect(screen.getByText(/\+\$140\.50 net/)).toBeInTheDocument();
    expect(screen.getByText(/67% win rate/)).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 replays/)).toBeInTheDocument();
    expect(screen.getByText(/\$1\.30 a trade, the median of 12 trades taken/)).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /T1/ })).toHaveTextContent('1');
    expect(screen.getByRole('row', { name: /Backstop/ })).toHaveTextContent('1');
    expect(screen.getByRole('row', { name: /Time stop/ })).toHaveTextContent('1');
  });

  it('says when no plan was left unfilled, and when none of them triggered', async () => {
    server.use(http.get('/api/insights/plans-not-taken', () => HttpResponse.json({ ...result, plans: 0, neverTriggered: 0, replayed: 0, exits: {}, summary: { trades: 0 } })));
    renderIt();

    await userEvent.click(screen.getByRole('button', { name: 'Replay plans not taken' }));

    expect(await screen.findByText('No option plans were left unfilled in this range.')).toBeInTheDocument();
  });

  it('shows the API error message', async () => {
    server.use(http.get('/api/insights/plans-not-taken', () => HttpResponse.json({ error: 'Could not fetch' }, { status: 502 })));
    renderIt();

    await userEvent.click(screen.getByRole('button', { name: 'Replay plans not taken' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not fetch');
  });
});
