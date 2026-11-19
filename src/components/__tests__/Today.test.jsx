import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import Today from '../Today';

// Midday on 2026-11-19 in New York.
beforeEach(() => vi.setSystemTime(new Date('2026-11-19T17:00:00Z')));
afterEach(() => vi.useRealTimers());

const call = (overrides = {}) => ({
  id: 't1',
  mode: 'live',
  symbol: 'SPY',
  assetClass: 'option',
  direction: 'long',
  quantity: 1,
  multiplier: 100,
  optionType: 'call',
  strike: 590,
  expiration: '2026-11-19',
  entryPrice: 1,
  exitPrice: 1.5,
  fees: 1.3,
  openedAt: '2026-11-19T14:40:00.000Z',
  closedAt: '2026-11-19T14:52:00.000Z',
  ...overrides,
});

const fibPlan = { tradeDate: '2026-11-19', symbol: 'SPY', ltfDirection: 'bullish', ltfFib50: 590, ltfFib100: 595 };

const emptySummary = {
  tradeCount: 0,
  closedCount: 0,
  netPnl: 0,
  reviewed: 0,
  steps: {
    plan: 'todo',
    import: 'todo',
    review: { status: 'waiting', done: 0, of: 0 },
    coach: { status: 'waiting', done: 0, of: 0 },
  },
  rows: [],
};

// A day with two closed trades, one reviewed and coached, and one still open.
const busyDay = {
  day: '2026-11-19',
  mode: 'live',
  plans: [fibPlan],
  summary: {
    tradeCount: 3,
    closedCount: 2,
    netPnl: 48.7,
    reviewed: 1,
    steps: {
      plan: 'done',
      import: 'open',
      review: { status: 'todo', done: 1, of: 2 },
      coach: { status: 'done', done: 1, of: 1 },
    },
    rows: [
      {
        trade: call(),
        pnl: 48.7,
        reviews: [{ id: 'r1', kind: 'review', tradeId: 't1', coaching: 'Held to T1.', coachedAt: '2026-11-19T22:00:00.000Z' }],
      },
      { trade: call({ id: 't2', optionType: 'put', strike: 585, exitPrice: 0.9, openedAt: '2026-11-19T15:10:00.000Z' }), pnl: -11.3, reviews: [] },
      { trade: call({ id: 't3', exitPrice: null, closedAt: null, openedAt: '2026-11-19T19:00:00.000Z' }), pnl: null, reviews: [] },
    ],
  },
};

// Answers /api/today from `days` keyed by 'day|mode', an empty day otherwise,
// and records each query asked.
function serveToday(days = {}) {
  const asked = [];
  server.use(
    http.get('*/api/today', ({ request }) => {
      const params = new URL(request.url).searchParams;
      const day = params.get('day');
      const mode = params.get('mode');
      asked.push(`${day}|${mode}`);
      return HttpResponse.json(days[`${day}|${mode}`] ?? { day, mode, plans: [], summary: emptySummary });
    }),
    http.get('*/api/daily-plan', () => HttpResponse.json({ plan: null }))
  );
  return asked;
}

function renderToday() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <Today />
    </SWRConfig>
  );
}

const step = (name) => screen.getByRole('region', { name });

describe('Today', () => {
  it("opens on today's New York date in live mode", async () => {
    const asked = serveToday();
    renderToday();

    expect(await screen.findByText('0 trades')).toBeInTheDocument();
    expect(asked).toEqual(['2026-11-19|live']);
    expect(screen.getByLabelText('Day')).toHaveValue('2026-11-19');
  });

  it("heads the day with its trades, net P/L, and how many are reviewed", async () => {
    serveToday({ '2026-11-19|live': busyDay });
    renderToday();

    expect(await screen.findByText('3 trades')).toBeInTheDocument();
    expect(screen.getByText('+$48.70 net')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 reviewed')).toBeInTheDocument();
  });

  it('starts an empty day with the plan form open and the later steps waiting', async () => {
    serveToday();
    renderToday();

    const plan = await screen.findByRole('region', { name: /plan/i });
    expect(within(plan).getByText('To do')).toBeInTheDocument();
    expect(await within(plan).findByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(within(step(/import/i)).getByText('No trades yet')).toBeInTheDocument();
    expect(within(step(/review/i)).getByText('Nothing yet')).toBeInTheDocument();
    expect(within(step(/coach/i)).getByText('Nothing yet')).toBeInTheDocument();
  });

  it("saves the plan for the picked day, with no Day field of its own, and reloads the day", async () => {
    const asked = serveToday();
    const saved = [];
    server.use(
      http.put('*/api/daily-plan', async ({ request }) => {
        const body = await request.json();
        saved.push(body);
        return HttpResponse.json({ plan: body });
      })
    );
    const user = userEvent.setup();
    renderToday();

    const plan = await screen.findByRole('region', { name: /plan/i });
    await user.click(await within(plan).findByRole('button', { name: /save/i }));

    await vi.waitFor(() => expect(asked).toHaveLength(2));
    expect(saved[0]).toMatchObject({ tradeDate: '2026-11-19', symbol: 'SPY' });
    expect(screen.getAllByLabelText('Day')).toHaveLength(1);
  });

  it('collapses a done plan to its levels, with a button to edit it', async () => {
    serveToday({ '2026-11-19|live': busyDay });
    const user = userEvent.setup();
    renderToday();

    const plan = await screen.findByRole('region', { name: /plan/i });
    expect(await within(plan).findByText('Done')).toBeInTheDocument();
    expect(within(plan).getByText(/SPY.*590.*595/)).toBeInTheDocument();
    expect(within(plan).queryByRole('button', { name: /save/i })).not.toBeInTheDocument();

    await user.click(within(plan).getByRole('button', { name: /edit/i }));
    expect(await within(plan).findByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it("lists the day's trades in order with their result and review status", async () => {
    serveToday({ '2026-11-19|live': busyDay });
    renderToday();

    const review = await screen.findByRole('region', { name: /review/i });
    expect(await within(review).findByText('1 of 2')).toBeInTheDocument();
    const rows = within(review).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/SPY 590C/);
    expect(rows[0]).toHaveTextContent('$48.70');
    expect(rows[0]).toHaveTextContent('Reviewed');
    expect(rows[1]).toHaveTextContent('-$11.30');
    expect(rows[1]).toHaveTextContent('Not reviewed');
    expect(rows[2]).toHaveTextContent('Still open');
  });

  it('reviews a trade from its row, voice note first, then reloads the day and closes', async () => {
    const asked = serveToday({ '2026-11-19|live': busyDay });
    const posted = [];
    server.use(
      http.get('*/api/journal', () => HttpResponse.json({ entries: [] })),
      http.get('*/api/recording-prompts', () => HttpResponse.json({ preTradePrompt: '', endOfDayPrompt: '', micTips: '' })),
      http.post('*/api/journal', async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json({ entry: { id: 'r2' } }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    renderToday();

    const review = await screen.findByRole('region', { name: /review/i });
    const rows = await within(review).findAllByRole('listitem');
    // A reviewed trade can take another review; an open one waits for its exit.
    expect(within(rows[0]).getByRole('button', { name: 'Review again' })).toBeInTheDocument();
    expect(within(rows[2]).queryByRole('button')).not.toBeInTheDocument();

    await user.click(within(rows[1]).getByRole('button', { name: 'Review' }));
    const panel = within(review).getByRole('group', { name: /review of long 1 spy 585p/i });
    const record = within(panel).getByRole('button', { name: 'Record voice note' });
    const notes = within(panel).getByLabelText('Notes');
    // The Record button comes before the Notes field in the page.
    expect(record.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(notes, 'Chased the put.');
    await user.click(within(panel).getByRole('button', { name: 'Save review' }));

    await vi.waitFor(() => expect(asked).toHaveLength(2));
    expect(posted[0]).toMatchObject({ kind: 'review', tradeId: 't2', notes: 'Chased the put.' });
    expect(within(review).queryByRole('group', { name: /review of/i })).not.toBeInTheDocument();
  });

  it("shows each review's coaching under Coach", async () => {
    serveToday({ '2026-11-19|live': busyDay });
    renderToday();

    const coach = await screen.findByRole('region', { name: /coach/i });
    expect(await within(coach).findByText('Held to T1.')).toBeInTheDocument();
    expect(within(coach).getByRole('button', { name: /coach again/i })).toBeInTheDocument();
  });

  it('steps back a day and switches mode', async () => {
    const asked = serveToday();
    const user = userEvent.setup();
    renderToday();
    await screen.findByText('0 trades');

    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    await screen.findByDisplayValue('2026-11-18');
    await user.selectOptions(within(screen.getByRole('group', { name: 'Day and mode' })).getByLabelText('Mode'), 'paper');

    await vi.waitFor(() => expect(asked).toContain('2026-11-18|paper'));
    expect(asked).toContain('2026-11-18|live');
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();
  });

  it('ignores a typed day after today', async () => {
    const asked = serveToday();
    renderToday();
    await screen.findByText('0 trades');

    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-12-25' } });

    expect(screen.getByLabelText('Day')).toHaveValue('2026-11-19');
    expect(asked).toEqual(['2026-11-19|live']);
  });

  it('names the display zone beside the times on the trades', async () => {
    serveToday({ '2026-11-19|live': busyDay });
    renderToday();

    const review = await screen.findByRole('region', { name: /review/i });
    expect(await within(review).findByText(/times in Pacific/i)).toBeInTheDocument();
  });

  describe('in the demo', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('shows the plan as text and leaves out the forms, the importer, and the Review buttons', async () => {
      vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
      serveToday({ '2026-11-19|live': busyDay });
      renderToday();

      const plan = await screen.findByRole('region', { name: /plan/i });
      expect(within(plan).getByText(/SPY.*590.*595/)).toBeInTheDocument();
      expect(within(plan).queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
      await userEvent.click(within(plan).getByRole('button', { name: 'Show' }));
      expect(within(plan).queryByRole('button', { name: /save/i })).not.toBeInTheDocument();

      const importStep = screen.getByRole('region', { name: /import/i });
      expect(within(importStep).queryByLabelText('Account statement (CSV)')).not.toBeInTheDocument();

      const review = screen.getByRole('region', { name: /review/i });
      expect(within(review).queryByRole('button', { name: /review/i })).not.toBeInTheDocument();
      expect(within(review).getAllByRole('listitem')).toHaveLength(3);
    });

    it('leaves out the names of reviews with no stored coaching', async () => {
      vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
      const uncoached = structuredClone(busyDay);
      uncoached.summary.rows[1].reviews = [{ id: 'r9', kind: 'review', tradeId: 't2', coaching: null }];
      serveToday({ '2026-11-19|live': uncoached });
      renderToday();

      const coach = await screen.findByRole('region', { name: /coach/i });
      expect(await within(coach).findByText('Held to T1.')).toBeInTheDocument();
      expect(within(coach).queryByText(/585P/)).not.toBeInTheDocument();
    });
  });

  it("doesn't step past today", async () => {
    serveToday();
    renderToday();
    await screen.findByText('0 trades');

    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
  });
});
