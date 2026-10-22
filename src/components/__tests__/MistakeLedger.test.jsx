import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import MistakeLedger from '../MistakeLedger';

const ledger = {
  mistakes: [
    { mistake: 'moved_stop', trades: 3, totalR: -4.5, averageR: -1.5 },
    { mistake: 'exited_early', trades: 2, totalR: 0.6, averageR: 0.3 },
  ],
  baseline: { trades: 5, averageR: 0.62 },
  trades: 10,
};

// Serve the ledger and record the mode each request asked for.
function serveLedger(body = ledger) {
  const modes = [];
  server.use(
    http.get('*/api/insights/mistakes', ({ request }) => {
      modes.push(new URL(request.url).searchParams.get('mode'));
      return HttpResponse.json(body);
    })
  );
  return modes;
}

function renderLedger() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <MistakeLedger />
    </SWRConfig>
  );
}

describe('MistakeLedger', () => {
  it('lists each mistake with its trades and R, costliest first', async () => {
    serveLedger();
    renderLedger();

    const rows = await screen.findAllByRole('row');
    // The header, then one row per mistake.
    expect(within(rows[1]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'Moved stop',
      '3',
      '-4.5R',
      '-1.5R',
    ]);
    expect(within(rows[2]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'Exited early',
      '2',
      '+0.6R',
      '+0.3R',
    ]);
  });

  it('compares against trades with no mistakes', async () => {
    serveLedger();
    renderLedger();

    expect(await screen.findByText(/5 trades with no mistakes averaged \+0\.6R/i)).toBeInTheDocument();
    expect(screen.getByText(/from 10 closed trades/i)).toBeInTheDocument();
  });

  it('asks for one mode when chosen', async () => {
    const modes = serveLedger();
    renderLedger();
    await screen.findAllByRole('row');

    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'live');

    await screen.findAllByRole('row');
    expect(modes).toEqual([null, 'live']);
  });

  it('explains what to do when there are no closed trades yet', async () => {
    serveLedger({ mistakes: [], baseline: { trades: 0, averageR: null }, trades: 0 });
    renderLedger();

    expect(await screen.findByText(/no closed trades yet/i)).toBeInTheDocument();
  });

  it('says so when closed trades have no mistakes tagged', async () => {
    serveLedger({ mistakes: [], baseline: { trades: 4, averageR: 0.5 }, trades: 4 });
    renderLedger();

    expect(await screen.findByText(/no mistakes tagged/i)).toBeInTheDocument();
  });

  it("shows the server's error", async () => {
    server.use(
      http.get('*/api/insights/mistakes', () =>
        HttpResponse.json({ error: 'Something went wrong. Try again.', requestId: 'req-1' }, { status: 500 })
      )
    );
    renderLedger();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again. (Reference: req-1)');
  });
});
