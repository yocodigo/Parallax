import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import JournalEntries from '../JournalEntries';

const TRADE_ID = '6f1c2a4e-0000-4000-8000-000000000001';

// Long 100 AAPL, planned at 210 with a stop at 205: 1R is $500.
function plannedTrade(overrides = {}) {
  return {
    id: TRADE_ID,
    mode: 'paper',
    symbol: 'AAPL',
    assetClass: 'stock',
    direction: 'long',
    quantity: 100,
    multiplier: 1,
    plannedEntry: 210,
    entryPrice: null,
    initialStop: 205,
    target: 220,
    exitPrice: null,
    fees: 0,
    openedAt: null,
    closedAt: null,
    exitReason: null,
    exitedPerPlan: null,
    ...overrides,
  };
}

const opened = { entryPrice: 210, openedAt: '2026-10-20T14:00:00.000Z' };

function entry(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    tradeId: TRADE_ID,
    kind: 'plan',
    symbol: null,
    notes: 'Breakout over 210.',
    emotion: null,
    mistakes: [],
    createdAt: '2026-10-20T13:30:00.000Z',
    trade: null,
    ...overrides,
  };
}

// A tiny in-memory journal: recording a fill updates the trade, and the list
// shows the change when it reloads. Returns the bodies posted.
function serveJournal(trade, { kinds = ['plan'], respond, excursions = null } = {}) {
  const posted = [];
  const state = { trade };
  server.use(
    http.get('*/api/journal', () =>
      HttpResponse.json({ entries: kinds.map((kind) => entry({ kind, trade: state.trade })) })
    ),
    http.get('*/api/trades/:id/excursions', () =>
      HttpResponse.json(excursions ?? { excursions: null, reason: 'No price bars for the time the trade was open' })
    ),
    http.post('*/api/trades/:id/:step', async ({ request, params }) => {
      const body = await request.json();
      posted.push({ step: params.step, id: params.id, body });
      const custom = respond?.(body);
      if (custom) return custom;
      state.trade = { ...state.trade, ...body };
      return HttpResponse.json({ trade: state.trade });
    })
  );
  return posted;
}

function renderJournal() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <JournalEntries />
    </SWRConfig>
  );
}

describe('recording a trade from the journal', () => {
  it('records the entry fill of a planned trade', async () => {
    const posted = serveJournal(plannedTrade());
    renderJournal();

    expect(await screen.findByText('Planned')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Record entry' }));
    await userEvent.type(screen.getByLabelText('Fill price'), '210.5');
    fireEvent.change(screen.getByLabelText('Fill time'), { target: { value: '2026-10-20T10:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }));

    expect(await screen.findByText('Open')).toBeInTheDocument();
    expect(posted).toEqual([
      {
        step: 'entry',
        id: TRADE_ID,
        body: { entryPrice: 210.5, openedAt: new Date('2026-10-20T10:00').toISOString() },
      },
    ]);
    expect(screen.getByText(/filled at 210.5/i)).toBeInTheDocument();
  });

  it("shows the server's message under the field it is about", async () => {
    serveJournal(plannedTrade(), {
      respond: () =>
        HttpResponse.json(
          { error: 'Invalid entry', fieldErrors: { openedAt: ["The fill time can't be in the future"] } },
          { status: 400 }
        ),
    });
    renderJournal();

    await userEvent.click(await screen.findByRole('button', { name: 'Record entry' }));
    await userEvent.type(screen.getByLabelText('Fill price'), '210');
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }));

    expect(await screen.findByText("The fill time can't be in the future")).toBeInTheDocument();
    expect(screen.getByLabelText('Fill time')).toHaveAttribute('aria-invalid', 'true');
  });

  it('closes an open trade and shows its result', async () => {
    const posted = serveJournal(plannedTrade(opened));
    renderJournal();

    await userEvent.click(await screen.findByRole('button', { name: 'Record exit' }));
    await userEvent.type(screen.getByLabelText('Exit price'), '220');
    fireEvent.change(screen.getByLabelText('Exit time'), { target: { value: '2026-10-21T11:30' } });
    await userEvent.selectOptions(screen.getByLabelText('Reason'), 'target');
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    await userEvent.type(screen.getByLabelText('Fees'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Save exit' }));

    expect(await screen.findByText('Closed')).toBeInTheDocument();
    expect(posted[0]).toEqual({
      step: 'exit',
      id: TRADE_ID,
      body: {
        exitPrice: 220,
        closedAt: new Date('2026-10-21T11:30').toISOString(),
        exitReason: 'target',
        exitedPerPlan: true,
        fees: 2,
      },
    });
    // (220 - 210) x 100 - 2 = $998, against $500 of risk.
    expect(screen.getByText('+$998.00')).toBeInTheDocument();
    expect(screen.getByText('+2.0R')).toBeInTheDocument();
  });

  it("leaves out an unanswered 'followed the plan', so the server can ask for it", async () => {
    const posted = serveJournal(plannedTrade(opened), {
      respond: () =>
        HttpResponse.json(
          { error: 'Invalid exit', fieldErrors: { exitedPerPlan: ['Say whether you followed the plan'] } },
          { status: 400 }
        ),
    });
    renderJournal();

    await userEvent.click(await screen.findByRole('button', { name: 'Record exit' }));
    await userEvent.type(screen.getByLabelText('Exit price'), '220');
    await userEvent.click(screen.getByRole('button', { name: 'Save exit' }));

    expect(await screen.findByText('Say whether you followed the plan')).toBeInTheDocument();
    expect(posted[0].body).not.toHaveProperty('exitedPerPlan');
  });

  it('shows the loss on a closed trade, with nothing left to record', async () => {
    serveJournal(
      plannedTrade({
        ...opened,
        exitPrice: 205,
        closedAt: '2026-10-21T15:00:00.000Z',
        exitReason: 'stop',
        exitedPerPlan: true,
      })
    );
    renderJournal();

    expect(await screen.findByText('-$500.00')).toBeInTheDocument();
    expect(screen.getByText('-1.0R')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /record/i })).not.toBeInTheDocument();
  });

  it("offers recording only on the plan, not on a review of the same trade", async () => {
    serveJournal(plannedTrade(), { kinds: ['review', 'plan'] });
    renderJournal();

    const [review, plan] = await screen.findAllByRole('listitem');
    expect(within(review).getByText('Planned')).toBeInTheDocument();
    expect(within(review).queryByRole('button', { name: 'Record entry' })).not.toBeInTheDocument();
    expect(within(plan).getByRole('button', { name: 'Record entry' })).toBeInTheDocument();
  });
});

describe('MAE and MFE', () => {
  const closed = {
    ...opened,
    exitPrice: 220,
    closedAt: '2026-10-21T15:00:00.000Z',
    exitReason: 'target',
    exitedPerPlan: true,
  };

  it('shows how far a trade went against and for it, in R', async () => {
    serveJournal(plannedTrade(closed), {
      excursions: { excursions: { mae: 4, mfe: 12.5, maeR: 0.8, mfeR: 2.5 }, timeframe: '1Min' },
    });
    renderJournal();

    expect(await screen.findByText('-0.8R')).toBeInTheDocument();
    expect(screen.getByText('+2.5R')).toBeInTheDocument();
    expect(screen.getByTitle(/furthest the price went against/i)).toHaveTextContent('MAE');
  });

  it('asks only for trades that have been entered', async () => {
    const requested = [];
    server.use(
      http.get('*/api/trades/:id/excursions', ({ params }) => {
        requested.push(params.id);
        return HttpResponse.json({ excursions: null, reason: 'n/a' });
      })
    );
    serveJournal(plannedTrade());
    renderJournal();

    await screen.findByText('Planned');
    expect(requested).toEqual([]);
  });

  it('shows nothing when there is nothing to measure', async () => {
    serveJournal(plannedTrade(closed));
    renderJournal();

    await screen.findByText('Closed');
    expect(screen.queryByText(/MAE/)).not.toBeInTheDocument();
  });
});

describe('circuit breakers', () => {
  const tripped = [{ breaker: 'dailyLoss', limitR: 3, todayR: -3.2 }];

  it('explains a tripped breaker and records the entry only when overridden', async () => {
    const posted = serveJournal(plannedTrade(), {
      respond: (body) =>
        body.override
          ? undefined
          : HttpResponse.json({ error: 'Circuit breaker tripped', breakers: tripped }, { status: 409 }),
    });
    renderJournal();

    await userEvent.click(await screen.findByRole('button', { name: 'Record entry' }));
    await userEvent.type(screen.getByLabelText('Fill price'), '210');
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }));

    expect(
      await screen.findByText('Daily loss limit reached: -3.2R today against a limit of 3.0R.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Open')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Record anyway' }));

    expect(await screen.findByText('Open')).toBeInTheDocument();
    expect(posted.map((p) => p.body.override)).toEqual([undefined, true]);
  });

  it('marks a trade whose entry overrode a breaker', async () => {
    serveJournal(plannedTrade({ ...opened, overriddenBreakers: ['dailyLoss', 'cooldown'] }));
    renderJournal();

    expect(await screen.findByText('Overrode: Daily loss limit, Cool-down')).toBeInTheDocument();
  });
});
