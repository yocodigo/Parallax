import { afterEach, describe, it, expect } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import JournalEntries from '../JournalEntries';
import { setDisplayZone } from '../useDisplayZone';

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
  // The chosen zone is module state that outlives a test.
  afterEach(() => {
    act(() => setDisplayZone('America/Los_Angeles'));
    localStorage.clear();
  });

  it('reads the fill time on the display zone clock', async () => {
    act(() => setDisplayZone('America/New_York'));
    const posted = serveJournal(plannedTrade());
    renderJournal();

    await userEvent.click(await screen.findByRole('button', { name: 'Record entry' }));
    await userEvent.type(screen.getByLabelText('Fill price'), '210.5');
    fireEvent.change(screen.getByLabelText('Fill time (Eastern)'), { target: { value: '2026-10-20T10:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }));

    await screen.findByText('Open');
    expect(posted[0].body.openedAt).toBe('2026-10-20T14:00:00.000Z');
  });

  it('records the entry fill of a planned trade', async () => {
    const posted = serveJournal(plannedTrade());
    renderJournal();

    expect(await screen.findByText('Planned')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Record entry' }));
    await userEvent.type(screen.getByLabelText('Fill price'), '210.5');
    fireEvent.change(screen.getByLabelText('Fill time (Pacific)'), { target: { value: '2026-10-20T10:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }));

    expect(await screen.findByText('Open')).toBeInTheDocument();
    expect(posted).toEqual([
      {
        step: 'entry',
        id: TRADE_ID,
        body: { entryPrice: 210.5, openedAt: '2026-10-20T17:00:00.000Z' },
      },
    ]);
    expect(screen.getByText(/filled at 210.5/i)).toBeInTheDocument();
  });

  it('leaves the stop out of the summary when there is none', async () => {
    serveJournal(plannedTrade({ assetClass: 'option', initialStop: null, target: null, plannedEntry: 1.3 }));
    renderJournal();

    expect(await screen.findByText('Entry 1.3')).toBeInTheDocument();
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
    expect(screen.getByLabelText('Fill time (Pacific)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('closes an open trade and shows its result', async () => {
    const posted = serveJournal(plannedTrade(opened));
    renderJournal();

    await userEvent.click(await screen.findByRole('button', { name: 'Record exit' }));
    await userEvent.type(screen.getByLabelText('Exit price'), '220');
    fireEvent.change(screen.getByLabelText('Exit time (Pacific)'), { target: { value: '2026-10-21T11:30' } });
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
        closedAt: '2026-10-21T18:30:00.000Z',
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
        exitReason: 'invalidation',
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

describe('money R for an option', () => {
  // One call bought at 1.00 and sold at 1.10: +$10, against $25 of assumed
  // risk at a 25% backstop.
  const option = (overrides = {}) =>
    plannedTrade({
      assetClass: 'option',
      quantity: 1,
      multiplier: 100,
      plannedEntry: 1,
      initialStop: null,
      target: null,
      entryPrice: 1,
      exitPrice: 1.1,
      openedAt: '2026-10-20T14:00:00.000Z',
      closedAt: '2026-10-20T14:10:00.000Z',
      exitReason: 'target',
      exitedPerPlan: true,
      ...overrides,
    });
  const serveRules = (backstopOn = true) =>
    server.use(
      http.get('*/api/rule-settings', () =>
        HttpResponse.json({ settings: { backstopOn, backstopPct: 0.25 } })
      )
    );

  it('shows R assumed from the backstop when the plan had no stop, labelled as assumed', async () => {
    serveJournal(option());
    serveRules();
    renderJournal();

    expect(await screen.findByText('+0.4R')).toBeInTheDocument();
    expect(screen.getByTitle(/assumed from the backstop/i)).toHaveTextContent('assumed');
  });

  it('shows no assumed R when the backstop rule is off', async () => {
    serveJournal(option());
    serveRules(false);
    renderJournal();

    expect(await screen.findByText('Closed')).toBeInTheDocument();
    expect(screen.queryByText('+0.4R')).not.toBeInTheDocument();
  });

  it('shows the recorded stop as plain R, with no assumed label', async () => {
    serveJournal(option({ initialStop: 0.8 }));
    renderJournal();

    expect(await screen.findByText('+0.5R')).toBeInTheDocument();
    expect(screen.queryByTitle(/assumed from the backstop/i)).not.toBeInTheDocument();
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

  describe('for an option, on its underlying', () => {
    const option = plannedTrade({
      ...closed,
      symbol: 'SPY',
      assetClass: 'option',
      optionType: 'call',
      strike: 580,
      expiration: '2026-11-10',
      multiplier: 100,
      quantity: 1,
      plannedEntry: 1.2,
      entryPrice: 1.2,
      exitPrice: 1.5,
      initialStop: null,
      target: null,
    });
    const measured = (extra = {}) => ({
      excursions: {
        mae: 0.5,
        mfe: 1.5,
        maeR: 0.5,
        mfeR: 1.5,
        stopSource: 'derived',
        stopRule: 'band_cross_s2',
        edgeMinutesOnly: false,
        between: null,
        ...extra,
      },
      measuredOn: 'underlying',
      timeframe: '1Min',
    });
    const serveRules = () =>
      server.use(http.get('*/api/rule-settings', () => HttpResponse.json({ settings: { backstopOn: false, backstopPct: 0.25 } })));

    it("shows the underlying's move in points and in R, naming where the stop came from", async () => {
      serveJournal(option, { excursions: measured() });
      serveRules();
      renderJournal();

      const line = await screen.findByTestId('underlying-excursions');
      expect(line).toHaveTextContent('SPY MAE -0.50 pts (-0.5R) · MFE +1.50 pts (+1.5R) · derived stop');
    });

    it('shows points only when there is no stop', async () => {
      serveJournal(option, { excursions: measured({ maeR: null, mfeR: null, stopSource: null, stopRule: null }) });
      serveRules();
      renderJournal();

      const line = await screen.findByTestId('underlying-excursions');
      expect(line).toHaveTextContent('SPY MAE -0.50 pts · MFE +1.50 pts');
      expect(line).not.toHaveTextContent('R');
    });

    it('flags a trade under two minutes, whose range is mostly its edge minutes, and gives the minutes between', async () => {
      const between = { mae: 0.2, mfe: 0.4, maeR: 0.2, mfeR: 0.4 };
      serveJournal(option, { excursions: measured({ edgeMinutesOnly: true, stopSource: 'plan', stopRule: null, between }) });
      serveRules();
      renderJournal();

      const line = await screen.findByTestId('underlying-excursions');
      expect(line).toHaveTextContent('planned stop');
      expect(within(line).getByTitle(/held under 2 minutes/i)).toHaveTextContent('edge minutes');
      expect(line).toHaveTextContent('between them: MAE -0.20 pts (-0.2R) · MFE +0.40 pts (+0.4R)');
    });
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

describe('the strategy checklist', () => {
  const STRATEGY_ID = '6f1c2a4e-0000-4000-8000-000000000009';
  const strategy = {
    id: STRATEGY_ID,
    name: '15m BB acceptance',
    description: null,
    rules: [
      { id: 'r1', text: 'Accepted above the 15m band', kind: 'edge' },
      { id: 'r2', text: 'Not the first impulsive bar', kind: 'edge' },
    ],
  };

  const serveStrategies = () =>
    server.use(http.get('*/api/strategies', () => HttpResponse.json({ strategies: [strategy] })));

  const answer = async (ruleText, choice) =>
    userEvent.click(within(screen.getByRole('group', { name: ruleText })).getByRole('radio', { name: choice }));

  it("asks for each of the strategy's rules and sends the answers", async () => {
    serveStrategies();
    const posted = serveJournal(plannedTrade({ strategyId: STRATEGY_ID }));
    renderJournal();

    await userEvent.click(await screen.findByRole('button', { name: 'Record entry' }));
    await screen.findByRole('group', { name: 'Accepted above the 15m band' });
    await userEvent.type(screen.getByLabelText('Fill price'), '210');
    await answer('Accepted above the 15m band', 'Met');
    await answer('Not the first impulsive bar', 'Met');
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }));

    expect(await screen.findByText('Open')).toBeInTheDocument();
    expect(posted[0].body.ruleChecks).toEqual({ r1: true, r2: true });
  });

  it('names the rules not met and records the entry only when confirmed', async () => {
    serveStrategies();
    const posted = serveJournal(plannedTrade({ strategyId: STRATEGY_ID }), {
      respond: (body) =>
        body.override
          ? undefined
          : HttpResponse.json(
              { error: 'Checklist not met', unmetRules: ['Not the first impulsive bar'] },
              { status: 409 }
            ),
    });
    renderJournal();

    await userEvent.click(await screen.findByRole('button', { name: 'Record entry' }));
    await screen.findByRole('group', { name: 'Accepted above the 15m band' });
    await userEvent.type(screen.getByLabelText('Fill price'), '210');
    await answer('Accepted above the 15m band', 'Met');
    await answer('Not the first impulsive bar', 'Not met');
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You marked these rules as not met:');
    expect(alert).toHaveTextContent('Not the first impulsive bar');

    await userEvent.click(screen.getByRole('button', { name: 'Record anyway' }));

    expect(await screen.findByText('Open')).toBeInTheDocument();
    expect(posted[1].body).toMatchObject({ ruleChecks: { r1: true, r2: false }, override: true });
  });

  it('leaves out rules not answered, so the server can ask for them', async () => {
    serveStrategies();
    const posted = serveJournal(plannedTrade({ strategyId: STRATEGY_ID }), {
      respond: () =>
        HttpResponse.json(
          { error: 'Invalid entry', fieldErrors: { ruleChecks: ['Answer every rule on the checklist'] } },
          { status: 400 }
        ),
    });
    renderJournal();

    await userEvent.click(await screen.findByRole('button', { name: 'Record entry' }));
    await screen.findByRole('group', { name: 'Accepted above the 15m band' });
    await userEvent.type(screen.getByLabelText('Fill price'), '210');
    await answer('Accepted above the 15m band', 'Met');
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }));

    expect(await screen.findByText('Answer every rule on the checklist')).toBeInTheDocument();
    expect(posted[0].body.ruleChecks).toEqual({ r1: true });
  });
});

describe('context at entry', () => {
  it('loads the snapshot only when asked', async () => {
    const requested = [];
    server.use(
      http.get('*/api/trades/:id/context', ({ params }) => {
        requested.push(params.id);
        return HttpResponse.json({ context: null });
      })
    );
    serveJournal(plannedTrade(opened));
    renderJournal();

    await userEvent.click(await screen.findByRole('button', { name: 'Context at entry' }));

    expect(await screen.findByText('No context was captured for this entry.')).toBeInTheDocument();
    expect(requested).toEqual([TRADE_ID]);
  });

  it('is not offered before the trade is entered', async () => {
    serveJournal(plannedTrade());
    renderJournal();

    await screen.findByText('Planned');
    expect(screen.queryByRole('button', { name: 'Context at entry' })).not.toBeInTheDocument();
  });
});

describe('gates', () => {
  it('loads the pre-entry gates only when asked', async () => {
    const requested = [];
    server.use(
      http.get('*/api/trades/:id/gates', ({ params }) => {
        requested.push(params.id);
        return HttpResponse.json({ gates: null, reason: 'No gates to grade for this trade.' });
      })
    );
    serveJournal(plannedTrade(opened));
    renderJournal();

    await userEvent.click(await screen.findByRole('button', { name: 'Gates' }));

    expect(await screen.findByText('No gates to grade for this trade.')).toBeInTheDocument();
    expect(requested).toEqual([TRADE_ID]);
  });

  it('is not offered before the trade is entered', async () => {
    serveJournal(plannedTrade());
    renderJournal();

    await screen.findByText('Planned');
    expect(screen.queryByRole('button', { name: 'Gates' })).not.toBeInTheDocument();
  });
});

describe('entry review', () => {
  it('loads the entry review only when asked', async () => {
    const requested = [];
    server.use(
      http.get('*/api/trades/:id/review', ({ params }) => {
        requested.push(params.id);
        return HttpResponse.json({ review: null, reason: 'Nothing to review.' });
      })
    );
    serveJournal(plannedTrade(opened));
    renderJournal();

    await screen.findByRole('button', { name: 'Entry review' });
    expect(requested).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Entry review' }));

    expect(await screen.findByText('Nothing to review.')).toBeInTheDocument();
    expect(requested).toEqual([TRADE_ID]);
  });

  it('is not offered before the trade is entered', async () => {
    serveJournal(plannedTrade());
    renderJournal();

    await screen.findByText('Planned');
    expect(screen.queryByRole('button', { name: 'Entry review' })).not.toBeInTheDocument();
  });
});

describe('exit review', () => {
  const closed = { ...opened, exitPrice: 220, closedAt: '2026-10-21T15:00:00.000Z', exitReason: 'target' };

  it('loads the exit review only when asked', async () => {
    const requested = [];
    server.use(
      http.get('*/api/trades/:id/exit-review', ({ params }) => {
        requested.push(params.id);
        return HttpResponse.json({ review: null, reason: 'Nothing to grade.' });
      })
    );
    serveJournal(plannedTrade(closed));
    renderJournal();

    await screen.findByRole('button', { name: 'Exit review' });
    expect(requested).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Exit review' }));

    expect(await screen.findByText('Nothing to grade.')).toBeInTheDocument();
    expect(requested).toEqual([TRADE_ID]);
  });

  it('is not offered until the trade is closed', async () => {
    serveJournal(plannedTrade(opened));
    renderJournal();

    await screen.findByText('Open');
    expect(screen.queryByRole('button', { name: 'Exit review' })).not.toBeInTheDocument();
  });
});

describe('screenshots', () => {
  it('loads a planned trade’s screenshots only when asked', async () => {
    const requested = [];
    server.use(
      http.get('*/api/trades/:id/screenshots', ({ params }) => {
        requested.push(params.id);
        return HttpResponse.json({ screenshots: [] });
      })
    );
    serveJournal(plannedTrade());
    renderJournal();

    await screen.findByText('Planned');
    expect(requested).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Screenshots' }));

    expect(await screen.findByText('No screenshots yet.')).toBeInTheDocument();
    expect(requested).toEqual([TRADE_ID]);
  });
});
