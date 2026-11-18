import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import OptionExcursions from '../OptionExcursions';

const p = (p50, p75, p90) => ({ p50, p75, p90 });
const bands = (counts) => counts.map((trades, k) => ({ from: k * 0.05, to: k === 9 ? null : (k + 1) * 0.05, trades }));
const summary = (trades, counts, percentiles, excluded, underlyingOut = 0) => ({
  winners: 7,
  premium: { trades, excluded, bands: bands(counts), percentiles },
  underlying: {
    excluded: { edgeMinutesOnly: underlyingOut },
    r: { plan: { trades: 1, percentiles: p(0.2, 0.2, 0.2) }, derived: { trades: 3, percentiles: p(0.6, 1, 1) } },
    points: [
      { symbol: 'SPY', trades: 5, percentiles: p(0.5, 0.8, 1) },
      { symbol: 'MSFT', trades: 1, percentiles: p(3, 3, 3) },
    ],
  },
});
const body = {
  heat: {
    rows: [],
    summary: summary(3, [1, 1, 1, 0, 0, 0, 0, 0, 0, 0], p(0.08, 0.12, 0.12), { partialCoverage: 1, edgeMinutesOnly: 1, delta: 1, none: 1 }, 1),
    summaryAll: summary(6, [1, 1, 2, 0, 1, 1, 0, 0, 0, 0], p(0.1, 0.25, 0.3), { partialCoverage: 0, edgeMinutesOnly: 0, delta: 0, none: 1 }),
  },
  afterExit: {
    rows: [],
    summary: {
      trades: 4,
      points: [{ symbol: 'SPY', trades: 4, percentiles: p(0.5, 0.8, 1) }],
      r: { plan: { trades: 1, percentiles: p(0.2, 0.2, 0.2) }, derived: { trades: 2, percentiles: p(0.25, 1, 1) } },
      t1: { judged: 3, reached: 2 },
    },
  },
  timing: {
    rows: [],
    untimed: 1,
    groups: [
      {
        timing: 'early',
        trades: 3,
        netPnl: -45.5,
        heatPoints: [{ symbol: 'SPY', trades: 3, percentiles: p(0.6, 0.9, 1.2) }],
        heatR: { plan: { trades: 0, percentiles: p(null, null, null) }, derived: { trades: 2, percentiles: p(0.8, 1.4, 1.4) } },
      },
      {
        timing: 'on',
        trades: 2,
        netPnl: 60,
        heatPoints: [{ symbol: 'SPY', trades: 2, percentiles: p(0.2, 0.3, 0.3) }],
        heatR: { plan: { trades: 0, percentiles: p(null, null, null) }, derived: { trades: 0, percentiles: p(null, null, null) } },
      },
      {
        timing: 'late',
        trades: 0,
        netPnl: 0,
        heatPoints: [],
        heatR: { plan: { trades: 0, percentiles: p(null, null, null) }, derived: { trades: 0, percentiles: p(null, null, null) } },
      },
      {
        timing: 'none',
        trades: 4,
        netPnl: -10,
        heatPoints: [{ symbol: 'SPY', trades: 4, percentiles: p(0.5, 0.7, 0.9) }],
        heatR: { plan: { trades: 0, percentiles: p(null, null, null) }, derived: { trades: 0, percentiles: p(null, null, null) } },
      },
    ],
  },
};

function serve(response = HttpResponse.json(body)) {
  const queries = [];
  server.use(
    http.get('*/api/insights/option-excursions', ({ request }) => {
      queries.push(Object.fromEntries(new URL(request.url).searchParams));
      return response;
    })
  );
  return queries;
}

const renderIt = () =>
  render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <OptionExcursions mode="live" year="2026" />
    </SWRConfig>
  );
const measure = () => userEvent.click(screen.getByRole('button', { name: 'Measure heat and after the exit' }));
const cells = (table, name) =>
  within(within(table).getByRole('rowheader', { name }).closest('tr'))
    .getAllByRole('cell')
    .map((c) => c.textContent);

describe('OptionExcursions', () => {
  it('measures only when asked, since it reads the bars of every trade', async () => {
    const queries = serve();
    renderIt();

    expect(queries).toEqual([]);
    await measure();

    expect(await screen.findByText(/3 of 7 winners in the trusted set/)).toBeInTheDocument();
    expect(queries[0]).toEqual({ mode: 'live', year: '2026' });
  });

  it("says what the trusted set is, what it leaves out and why, and the heat's percentiles", async () => {
    serve();
    renderIt();
    await measure();

    expect(
      await screen.findByText(
        "3 of 7 winners in the trusted set: the contract's own bars, a bar every minute, held 2 minutes or more. Left out: 1 with partial bar coverage, 1 mostly edge minutes, 1 estimated from delta, 1 with no premium figure."
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Premium against the trade before it worked: median 8%, p75 12%, p90 12% of the premium paid.')).toBeInTheDocument();
  });

  it('takes in the rest behind a toggle', async () => {
    serve();
    renderIt();
    await measure();

    await userEvent.click(await screen.findByRole('checkbox', { name: /include the rest/i }));

    expect(screen.getByText(/^6 of 7 winners, every one with a premium figure/)).toHaveTextContent('1 of them estimated from delta');
    expect(screen.getByText(/median 10%, p75 25%, p90 30%/)).toBeInTheDocument();
  });

  it('gives the underlying heat in R apart by where the stop came from, and in points for all', async () => {
    serve();
    renderIt();
    await measure();

    const table = await screen.findByRole('table', { name: 'Underlying heat on winners' });
    expect(cells(table, 'Planned stop (R)')).toEqual(['1', '0.2R', '0.2R', '0.2R']);
    expect(cells(table, 'Derived stop (R)')).toEqual(['3', '0.6R', '1.0R', '1.0R']);
    // Points each underlying apart: a point of SPY isn't a point of MSFT.
    expect(cells(table, 'SPY (points)')).toEqual(['5', '0.50', '0.80', '1.00']);
    expect(cells(table, 'MSFT (points)')).toEqual(['1', '3.00', '3.00', '3.00']);
    expect(screen.getByText('Left out of the underlying heat: 1 mostly edge minutes.')).toBeInTheDocument();
  });

  it('says which of the page filters it follows', async () => {
    serve();
    renderIt();

    expect(screen.getByText(/follows the page's Mode and Year only/)).toBeInTheDocument();
  });

  it('says the heat can read a little high, since the fill and exit minutes hold prices from outside the trade', async () => {
    serve();
    renderIt();
    await measure();

    expect(await screen.findByText(/fill and exit minutes hold prices from before the fill and after the exit/)).toBeInTheDocument();
  });

  it('gives how far the underlying ran on after the exits, and how often T1 came after', async () => {
    serve();
    renderIt();
    await measure();

    const table = await screen.findByRole('table', { name: 'After the exit' });
    expect(cells(table, 'Derived stop (R)')).toEqual(['2', '0.3R', '1.0R', '1.0R']);
    expect(cells(table, 'SPY (points)')).toEqual(['4', '0.50', '0.80', '1.00']);
    expect(screen.getByText('T1 reached within 15 minutes after the exit: 2 of the 3 exits whose day had a T1 and that exited short of it.')).toBeInTheDocument();
  });

  it('times the entries against their setup, with the net P/L and heat of each group', async () => {
    serve();
    renderIt();
    await measure();

    const timing = await screen.findByRole('table', { name: 'Entry timing' });
    expect(cells(timing, 'Early')).toEqual(['3', '-$45.50']);
    expect(cells(timing, 'On the trigger')).toEqual(['2', '+$60.00']);
    expect(cells(timing, 'Late')).toEqual(['0', '+$0.00']);
    expect(cells(timing, 'No trigger')).toEqual(['4', '-$10.00']);

    const heat = screen.getByRole('table', { name: 'Heat by entry timing' });
    expect(cells(heat, 'Early: SPY (points)')).toEqual(['3', '0.60', '0.90', '1.20']);
    expect(cells(heat, 'Early: derived stop (R)')).toEqual(['2', '0.8R', '1.4R', '1.4R']);
    expect(within(heat).queryByRole('rowheader', { name: 'Early: planned stop (R)' })).not.toBeInTheDocument();
    expect(screen.getByText('1 trade had no bars to time.')).toBeInTheDocument();
  });

  it('shows the error with its reference when the bars could not be fetched', async () => {
    serve(HttpResponse.json({ error: 'Could not fetch the bars to measure these trades', requestId: 'abc' }, { status: 502 }));
    renderIt();
    await measure();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not fetch the bars to measure these trades (Reference: abc)');
  });

  it('says so when no option trade closed in the range', async () => {
    const empty = {
      heat: { rows: [], summary: { ...body.heat.summary, winners: 0 }, summaryAll: { ...body.heat.summaryAll, winners: 0 } },
      afterExit: { rows: [], summary: { ...body.afterExit.summary, trades: 0 } },
      timing: { rows: [], untimed: 0, groups: body.timing.groups.map((g) => ({ ...g, trades: 0, netPnl: 0, heatPoints: [] })) },
    };
    serve(HttpResponse.json(empty));
    renderIt();
    await measure();

    expect(await screen.findByText('No winning option trades closed in this range.')).toBeInTheDocument();
    expect(screen.getByText('No option exits to measure in this range.')).toBeInTheDocument();
    expect(screen.getByText('No option entries to time in this range.')).toBeInTheDocument();
  });
});
