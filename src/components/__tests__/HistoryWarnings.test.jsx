import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import PlanForm from '../PlanForm';

// Answer warning requests with `warnings` and record each request's query.
function serveWarnings(warnings = []) {
  const queries = [];
  server.use(
    http.get('*/api/strategies', () => HttpResponse.json({ strategies: [] })),
    http.get('*/api/insights/warnings', ({ request }) => {
      queries.push(Object.fromEntries(new URL(request.url).searchParams));
      return HttpResponse.json({ warnings });
    })
  );
  return queries;
}

function renderForm() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <PlanForm />
    </SWRConfig>
  );
}

describe('warnings while writing a plan', () => {
  it('shows what the trader’s history says about trades like this one', async () => {
    serveWarnings([
      { rule: 'symbol', symbol: 'AAPL', trades: 8, averageR: -0.7 },
      { rule: 'side', direction: 'short', assetClass: 'option', trades: 5, averageR: -0.45 },
      { rule: 'session', sessionPart: 'close', trades: 6, averageR: -0.4 },
    ]);
    renderForm();

    expect(await screen.findByText('Your last 8 AAPL trades averaged -0.7R.')).toBeInTheDocument();
    expect(screen.getByText('Your last 5 short option trades averaged -0.5R.')).toBeInTheDocument();
    expect(screen.getByText('Your last 6 entries in the last 30 minutes of the session averaged -0.4R.')).toBeInTheDocument();
  });

  it('describes days-to-expiration warnings', async () => {
    serveWarnings([
      { rule: 'dteSession', dte: '0dte', sessionPart: 'close', trades: 8, averageR: -0.7 },
      { rule: 'dte', dte: 'week', trades: 6, averageR: -0.4 },
    ]);
    renderForm();

    expect(
      await screen.findByText('Your last 8 0DTE entries in the last 30 minutes of the session averaged -0.7R.')
    ).toBeInTheDocument();
    expect(screen.getByText('Your last 6 1–7 DTE trades averaged -0.4R.')).toBeInTheDocument();
  });

  it("sends an option plan's expiration", async () => {
    const queries = serveWarnings();
    renderForm();

    await userEvent.selectOptions(screen.getByLabelText('Asset class'), 'option');
    fireEvent.change(screen.getByLabelText('Expiration'), { target: { value: '2026-10-23' } });

    await waitFor(() => expect(queries.at(-1)).toMatchObject({ assetClass: 'option', expiration: '2026-10-23' }));
  });

  it('asks about the plan as it is filled in, once typing pauses', async () => {
    const queries = serveWarnings();
    renderForm();

    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'live');
    await userEvent.selectOptions(screen.getByLabelText('Direction'), 'short');
    await userEvent.type(screen.getByLabelText('Symbol'), 'TSLA');

    await waitFor(() =>
      expect(queries.at(-1)).toEqual({ mode: 'live', direction: 'short', assetClass: 'stock', symbol: 'TSLA' })
    );
    // Not one request per letter typed.
    expect(queries.filter((query) => ['T', 'TS', 'TSL'].includes(query.symbol))).toEqual([]);
  });

  it('shows nothing when the history has no warnings', async () => {
    const queries = serveWarnings([]);
    renderForm();

    await waitFor(() => expect(queries.length).toBeGreaterThan(0));
    expect(screen.queryByText(/your last/i)).not.toBeInTheDocument();
  });
});
