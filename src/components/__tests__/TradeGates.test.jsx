import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import TradeGates from '../TradeGates';

const TRADE_ID = '6f1c2a4e-0000-4000-8000-000000000002';

function serveGates(body) {
  server.use(http.get(`*/api/trades/${TRADE_ID}/gates`, () => HttpResponse.json(body)));
}

function renderGates() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <TradeGates tradeId={TRADE_ID} />
    </SWRConfig>
  );
}

describe('TradeGates', () => {
  it('shows each gate, in the setups.md order, met or missed', async () => {
    serveGates({
      gates: {
        window: 'met',
        direction: 'missed',
        entry: 'met',
        location: 'unknown',
        target: 'met',
        state: 'met',
        stop: 'met',
      },
    });
    renderGates();

    expect(await screen.findByText('Window OK')).toBeInTheDocument();
    expect(screen.getByText('Direction missed')).toBeInTheDocument();
    expect(screen.getByText('Location ?')).toBeInTheDocument();

    // Order follows the setups.md table: Window, Direction, Entry, Location,
    // Stop, Target, State (Size is left out here, a stock trade).
    const labels = screen.getAllByText(/OK|missed|\?/).map((el) => el.textContent);
    expect(labels).toEqual([
      'Window OK',
      'Direction missed',
      'Entry OK',
      'Location ?',
      'Stop OK',
      'Target OK',
      'State OK',
    ]);
  });

  it("shows Size for an option trade, where it's graded", async () => {
    serveGates({
      gates: {
        window: 'met',
        size: 'met',
        direction: 'met',
        entry: 'met',
        location: 'met',
        target: 'met',
        state: 'met',
        stop: 'met',
      },
    });
    renderGates();

    const labels = await screen.findAllByText(/OK|missed|\?/);
    expect(labels.map((el) => el.textContent)).toEqual([
      'Window OK',
      'Size OK',
      'Direction OK',
      'Entry OK',
      'Location OK',
      'Stop OK',
      'Target OK',
      'State OK',
    ]);
  });

  it('explains why there are no gates to grade', async () => {
    serveGates({ gates: null, reason: 'Gates are only available for stocks and options so far' });
    renderGates();

    expect(
      await screen.findByText('Gates are only available for stocks and options so far')
    ).toBeInTheDocument();
  });
});
