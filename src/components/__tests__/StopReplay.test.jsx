import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import StopReplay from '../StopReplay';

const set = (rules, values) => ({
  rules,
  trades: 4,
  averageR: null,
  byReason: {},
  cutBeforeT1: 0,
  cutBeforeT1ByReason: {},
  cutBeforeT1Share: 0,
  averageRWhenCut: null,
  ...values,
});
const report = {
  replayed: 4,
  skipped: 1,
  ruleSets: [
    set(['S1'], { averageR: 0.4 }),
    set(['S2'], { averageR: -0.3, cutBeforeT1: 1, cutBeforeT1Share: 0.25, averageRWhenCut: -1 }),
    set(['S1', 'S2'], { averageR: 0.1 }),
  ],
};

// Serve the replay and record the mode each request asked for.
function serveReplay(body = report, status = 200) {
  const modes = [];
  server.use(
    http.get('*/api/insights/stops', ({ request }) => {
      modes.push(new URL(request.url).searchParams.get('mode'));
      return HttpResponse.json(body, { status });
    })
  );
  return modes;
}

function renderReplay() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <StopReplay />
    </SWRConfig>
  );
}

const cells = (row) => within(row).getAllByRole('cell').map((cell) => cell.textContent);

describe('StopReplay', () => {
  it('compares the stop rules replayed over your trades', async () => {
    serveReplay();
    renderReplay();

    const table = await screen.findByRole('table', { name: 'Stop rules' });
    const rows = within(table).getAllByRole('row');
    expect(cells(rows[1])).toEqual(['S1 · 5m band', '4', '+0.4R', '0', '—']);
    expect(cells(rows[2])).toEqual(['S2 · 1m structure', '4', '-0.3R', '1 (25%)', '-1.0R']);
    expect(cells(rows[3])).toEqual(['S1 + S2', '4', '+0.1R', '0', '—']);
  });

  it('says how many trades it replayed and skipped, and that S3 waits for the fib levels', async () => {
    serveReplay();
    renderReplay();

    expect(await screen.findByText(/Replayed 4 closed SPY trades on SPY 1m bars; 1 skipped/)).toBeInTheDocument();
    expect(screen.getByText(/S3 and T1 come with each day's fib levels/)).toBeInTheDocument();
  });

  it('explains when there is nothing to replay', async () => {
    serveReplay({ replayed: 0, skipped: 0, ruleSets: report.ruleSets.map((s) => ({ ...s, trades: 0 })) });
    renderReplay();

    expect(await screen.findByText(/No closed SPY trades to replay yet/)).toBeInTheDocument();
  });

  it('shows the error when the replay fails', async () => {
    serveReplay({ error: 'Upstream data provider returned 429', requestId: 'req-1' }, 502);
    renderReplay();

    expect(await screen.findByRole('alert')).toHaveTextContent('Upstream data provider returned 429');
  });

  it('can be limited to one mode', async () => {
    const modes = serveReplay();
    renderReplay();
    await screen.findByRole('table', { name: 'Stop rules' });

    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'live');
    await screen.findByRole('table', { name: 'Stop rules' });
    expect(modes).toContain('live');
  });
});
