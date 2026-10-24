import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import JournalEntries from '../JournalEntries';
import PlanForm from '../PlanForm';

// Record the body of each /api/plans request and answer with `response`.
function capturePlanRequests(response = () => HttpResponse.json({}, { status: 201 })) {
  const bodies = [];
  server.use(
    http.post('*/api/plans', async ({ request }) => {
      const body = await request.json();
      bodies.push(body);
      return response(body);
    })
  );
  return bodies;
}

// The form asks for warnings from the trader's history as it's filled in;
// these tests are about saving, so the history has none.
const STRATEGY_ID = '6f1c2a4e-0000-4000-8000-000000000009';

// The form also loads the trader's strategies.
beforeEach(() => {
  server.use(
    http.get('*/api/insights/warnings', () => HttpResponse.json({ warnings: [] })),
    http.get('*/api/strategies', () =>
      HttpResponse.json({ strategies: [{ id: STRATEGY_ID, name: '15m BB acceptance', description: null, rules: [] }] })
    )
  );
});

function renderForm(children = <PlanForm />) {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>{children}</SWRConfig>
  );
}

async function fillRequiredFields() {
  await userEvent.type(screen.getByLabelText('Symbol'), 'AAPL');
  await userEvent.type(screen.getByLabelText('Quantity'), '100');
  await userEvent.type(screen.getByLabelText('Planned entry'), '210');
  // Labeled "Initial stop (optional)" on an option.
  await userEvent.type(screen.getByLabelText(/^Initial stop/), '205');
  await userEvent.type(screen.getByLabelText('Notes'), 'Breakout over 210.');
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save plan' }));

describe('PlanForm', () => {
  it('sends the plan and its notes with prices as numbers', async () => {
    const bodies = capturePlanRequests();
    renderForm();

    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'live');
    await userEvent.selectOptions(screen.getByLabelText('Direction'), 'short');
    await fillRequiredFields();
    await userEvent.clear(screen.getByLabelText('Initial stop'));
    await userEvent.type(screen.getByLabelText('Initial stop'), '215');
    await userEvent.type(screen.getByLabelText('Target'), '200.5');
    await userEvent.selectOptions(screen.getByLabelText('Emotion'), 'calm');
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      plan: {
        mode: 'live',
        symbol: 'AAPL',
        assetClass: 'stock',
        direction: 'short',
        quantity: 100,
        plannedEntry: 210,
        initialStop: 215,
        target: 200.5,
      },
      entry: { notes: 'Breakout over 210.', emotion: 'calm' },
    });
  });

  it('leaves out the target and emotion when they are blank', async () => {
    const bodies = capturePlanRequests();
    renderForm();

    await fillRequiredFields();
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].plan).not.toHaveProperty('target');
    expect(bodies[0].entry).not.toHaveProperty('emotion');
  });

  it('shows the field errors the server sends back', async () => {
    capturePlanRequests(() =>
      HttpResponse.json(
        {
          error: 'Invalid plan',
          fieldErrors: {
            plan: { initialStop: ['Stop must be below the entry for a long and above it for a short'] },
            entry: { notes: ['Notes cannot be empty'] },
          },
        },
        { status: 400 }
      )
    );
    renderForm();

    await fillRequiredFields();
    await save();

    expect(
      await screen.findByText('Stop must be below the entry for a long and above it for a short')
    ).toBeInTheDocument();
    expect(screen.getByText('Notes cannot be empty')).toBeInTheDocument();
    expect(screen.getByLabelText('Initial stop')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sends the strategy the plan follows', async () => {
    const bodies = capturePlanRequests();
    renderForm();

    await screen.findByRole('option', { name: '15m BB acceptance' });
    await userEvent.selectOptions(screen.getByLabelText('Strategy'), '15m BB acceptance');
    await fillRequiredFields();
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].plan.strategyId).toBe(STRATEGY_ID);
  });

  it("asks for an option's contract and sends it", async () => {
    const bodies = capturePlanRequests();
    renderForm();

    expect(screen.queryByLabelText('Strike')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Asset class'), 'option');
    await fillRequiredFields();
    await userEvent.selectOptions(screen.getByLabelText('Call or put'), 'put');
    await userEvent.type(screen.getByLabelText('Strike'), '205');
    fireEvent.change(screen.getByLabelText('Expiration'), { target: { value: '2026-10-23' } });
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].plan).toMatchObject({
      assetClass: 'option',
      optionType: 'put',
      strike: 205,
      expiration: '2026-10-23',
    });
  });

  it('lets an option plan go without a stop', async () => {
    const bodies = capturePlanRequests();
    renderForm();

    expect(screen.getByLabelText('Initial stop')).toBeRequired();
    await userEvent.selectOptions(screen.getByLabelText('Asset class'), 'option');
    expect(screen.getByLabelText('Initial stop (optional)')).not.toBeRequired();

    await userEvent.type(screen.getByLabelText('Symbol'), 'SPY');
    await userEvent.type(screen.getByLabelText('Quantity'), '1');
    await userEvent.type(screen.getByLabelText('Planned entry'), '1.30');
    await userEvent.type(screen.getByLabelText('Notes'), 'Put on the rejection.');
    await userEvent.type(screen.getByLabelText('Strike'), '761');
    fireEvent.change(screen.getByLabelText('Expiration'), { target: { value: '2026-10-23' } });
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].plan).not.toHaveProperty('initialStop');
  });

  it('sends no contract for a stock', async () => {
    const bodies = capturePlanRequests();
    renderForm();

    await userEvent.selectOptions(screen.getByLabelText('Asset class'), 'option');
    await userEvent.type(screen.getByLabelText('Strike'), '205');
    await userEvent.selectOptions(screen.getByLabelText('Asset class'), 'stock');
    await fillRequiredFields();
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].plan).not.toHaveProperty('strike');
    expect(bodies[0].plan).not.toHaveProperty('optionType');
  });

  it('sends no strategy when none is chosen', async () => {
    const bodies = capturePlanRequests();
    renderForm();

    await fillRequiredFields();
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].plan).not.toHaveProperty('strategyId');
  });

  it('shows the error when the plan cannot be saved', async () => {
    capturePlanRequests(() =>
      HttpResponse.json({ error: 'Database unavailable', requestId: 'req-123' }, { status: 500 })
    );
    renderForm();

    await fillRequiredFields();
    await save();

    expect(await screen.findByText('Database unavailable (Reference: req-123)')).toBeInTheDocument();
  });

  it('adds the saved plan to the journal and clears the form', async () => {
    // A tiny in-memory journal: saving a plan adds an entry the list can load.
    const entries = [];
    server.use(http.get('*/api/journal', () => HttpResponse.json({ entries })));
    capturePlanRequests(({ plan, entry }) => {
      const trade = { id: crypto.randomUUID(), multiplier: 1, ...plan };
      entries.unshift({
        id: crypto.randomUUID(),
        tradeId: trade.id,
        kind: 'plan',
        symbol: null,
        emotion: null,
        mistakes: [],
        createdAt: '2026-10-21T15:00:00.000Z',
        ...entry,
        trade,
      });
      return HttpResponse.json({ trade, entry: entries[0] }, { status: 201 });
    });
    renderForm(
      <>
        <PlanForm />
        <JournalEntries />
      </>
    );
    expect(await screen.findByText('No journal entries yet.')).toBeInTheDocument();

    await fillRequiredFields();
    await save();

    expect(await screen.findByText('Long 100 AAPL')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toHaveValue('');
    expect(screen.getByLabelText('Symbol')).toHaveValue('');
  });

  it('starts from a draft and shows the errors it came with', async () => {
    renderForm(
      <PlanForm
        draft={{
          plan: { symbol: 'AAPL', direction: 'short', quantity: 100, plannedEntry: 210 },
          entry: { notes: 'Fading the gap.', emotion: 'fomo', mistakes: [] },
        }}
        draftErrors={{ plan: { initialStop: ['Invalid input: expected number, received undefined'] }, entry: {} }}
      />
    );

    expect(screen.getByLabelText('Symbol')).toHaveValue('AAPL');
    expect(screen.getByLabelText('Direction')).toHaveValue('short');
    expect(screen.getByLabelText('Quantity')).toHaveValue(100);
    expect(screen.getByLabelText('Planned entry')).toHaveValue(210);
    expect(screen.getByLabelText('Initial stop')).toHaveValue(null);
    expect(screen.getByLabelText('Mode')).toHaveValue('paper');
    expect(screen.getByLabelText('Notes')).toHaveValue('Fading the gap.');
    expect(screen.getByLabelText('Emotion')).toHaveValue('fomo');
    expect(
      screen.getByText('Invalid input: expected number, received undefined')
    ).toBeInTheDocument();
  });

  it('tells its parent once the plan is saved', async () => {
    const saved = { trade: { id: 't1' }, entry: { id: 'e1' } };
    capturePlanRequests(() => HttpResponse.json(saved, { status: 201 }));
    server.use(http.get('*/api/journal', () => HttpResponse.json({ entries: [] })));
    const onSaved = vi.fn();
    renderForm(<PlanForm onSaved={onSaved} />);

    await fillRequiredFields();
    await save();

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  });
});
