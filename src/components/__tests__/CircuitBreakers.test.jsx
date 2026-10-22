import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import CircuitBreakers from '../CircuitBreakers';

const settings = {
  maxDailyLossR: 3,
  maxTradesPerDay: null,
  cooldownAfterLosses: 3,
  cooldownMinutes: 60,
  modes: ['live'],
};

const quietDay = { tripped: [], today: { r: -1.2, trades: 2 }, losingStreak: 1 };

// Serve the breakers; a PUT saves the body and answers like the real route.
// Returns the bodies saved.
function serveBreakers({ initial = settings, status = quietDay, respond } = {}) {
  const saved = [];
  let current = initial;
  server.use(
    http.get('*/api/circuit-breakers', () => HttpResponse.json({ settings: current, status })),
    http.put('*/api/circuit-breakers', async ({ request }) => {
      const body = await request.json();
      saved.push(body);
      const custom = respond?.(body);
      if (custom) return custom;
      current = body;
      return HttpResponse.json({ settings: current, status });
    })
  );
  return saved;
}

function renderBreakers() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <CircuitBreakers />
    </SWRConfig>
  );
}

describe('CircuitBreakers', () => {
  it('shows the saved limits, with blanks for the ones that are off', async () => {
    serveBreakers();
    renderBreakers();

    expect(await screen.findByLabelText('Daily max loss (R)')).toHaveValue(3);
    expect(screen.getByLabelText('Max trades per day')).toHaveValue(null);
    expect(screen.getByLabelText('Cool-down after losses in a row')).toHaveValue(3);
    expect(screen.getByLabelText('Cool-down minutes')).toHaveValue(60);
    expect(screen.getByRole('checkbox', { name: 'Live' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Paper' })).not.toBeChecked();
  });

  it('shows where today stands', async () => {
    serveBreakers();
    renderBreakers();

    expect(await screen.findByText('Today: -1.2R over 2 trades. Losing streak: 1.')).toBeInTheDocument();
  });

  it('lists the breakers tripped right now', async () => {
    serveBreakers({
      status: { ...quietDay, tripped: [{ breaker: 'tradesPerDay', limit: 2, today: 2 }] },
    });
    renderBreakers();

    expect(await screen.findByText('Trade limit reached: 2 of 2 trades today.')).toBeInTheDocument();
  });

  it('saves the limits as numbers, a blank one as off', async () => {
    const saved = serveBreakers();
    renderBreakers();

    const tradeLimit = await screen.findByLabelText('Max trades per day');
    await userEvent.type(tradeLimit, '4');
    await userEvent.clear(screen.getByLabelText('Daily max loss (R)'));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Paper' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save limits' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({
      maxDailyLossR: null,
      maxTradesPerDay: 4,
      cooldownAfterLosses: 3,
      cooldownMinutes: 60,
      modes: ['live', 'paper'],
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it("shows the server's message under the field it is about", async () => {
    serveBreakers({
      respond: () =>
        HttpResponse.json(
          { error: 'Invalid circuit breakers', fieldErrors: { cooldownMinutes: ['Set how long the cool-down lasts'] } },
          { status: 400 }
        ),
    });
    renderBreakers();

    await userEvent.clear(await screen.findByLabelText('Cool-down minutes'));
    await userEvent.click(screen.getByRole('button', { name: 'Save limits' }));

    expect(await screen.findByText('Set how long the cool-down lasts')).toBeInTheDocument();
    expect(screen.getByLabelText('Cool-down minutes')).toHaveAttribute('aria-invalid', 'true');
  });
});
