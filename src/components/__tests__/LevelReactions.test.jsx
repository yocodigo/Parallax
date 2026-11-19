import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import LevelReactions from '../LevelReactions';

const kind = (name, sessions, reached, rejected, ranThrough, oscillating, none, undecided) => ({
  kind: name,
  sessions,
  reached,
  rejected,
  ranThrough,
  oscillating,
  none,
  undecided,
});
const result = {
  symbol: 'SPY',
  year: 2026,
  sessions: 40,
  kinds: [kind('prior_day_high', 40, 20, 8, 4, 4, 3, 1), kind('fib_50', 5, 0, 0, 0, 0, 0, 0)],
};

const renderIt = (props) =>
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <LevelReactions year={2026} symbols={['QQQ', 'SPY']} {...props} />
    </SWRConfig>
  );

describe('LevelReactions', () => {
  it('asks nothing until the button is pressed, then shows each level kind with how often it was reached', async () => {
    const urls = [];
    server.use(
      http.get('/api/insights/level-reactions', ({ request }) => {
        urls.push(new URL(request.url).search);
        return HttpResponse.json(result);
      })
    );
    renderIt();

    expect(urls).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Measure level reactions' }));

    const row = await screen.findByRole('row', { name: /Prior day high/ });
    expect(urls).toEqual(['?symbol=SPY&year=2026']);
    // 20 of 40 sessions reached it, then each outcome of the 20 touches.
    ['40', '50%', '8', '4', '4', '3', '1'].forEach((text) => expect(within(row).getAllByText(text).length).toBeGreaterThan(0));
    expect(screen.getByRole('row', { name: /Working fib 50%/ })).toHaveTextContent('0%');
  });

  it("measures the picked symbol, SPY first even when it wasn't traded", async () => {
    const urls = [];
    server.use(
      http.get('/api/insights/level-reactions', ({ request }) => {
        urls.push(new URL(request.url).search);
        return HttpResponse.json({ ...result, symbol: 'QQQ' });
      })
    );
    renderIt({ symbols: ['QQQ'] });

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['SPY', 'QQQ']);
    await userEvent.selectOptions(screen.getByLabelText('Symbol'), 'QQQ');
    await userEvent.click(screen.getByRole('button', { name: 'Measure level reactions' }));

    await screen.findByRole('row', { name: /Prior day high/ });
    expect(urls).toEqual(['?symbol=QQQ&year=2026']);
  });

  it('asks for one year when the page shows all of them', () => {
    renderIt({ year: 'all' });

    expect(screen.getByText(/Pick a single year/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Measure level reactions' })).not.toBeInTheDocument();
  });

  it('shows the API error message', async () => {
    server.use(http.get('/api/insights/level-reactions', () => HttpResponse.json({ error: 'Could not fetch' }, { status: 502 })));
    renderIt();

    await userEvent.click(screen.getByRole('button', { name: 'Measure level reactions' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not fetch');
  });

  it('says so when no session was judged', async () => {
    server.use(http.get('/api/insights/level-reactions', () => HttpResponse.json({ ...result, sessions: 0, kinds: [] })));
    renderIt();

    await userEvent.click(screen.getByRole('button', { name: 'Measure level reactions' }));

    expect(await screen.findByText(/No finished sessions with bars/)).toBeInTheDocument();
  });
});
