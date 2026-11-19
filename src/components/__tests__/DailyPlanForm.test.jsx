import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import DailyPlanForm from '../DailyPlanForm';

// A fixed "today" (New York) so the form's default date is predictable.
beforeEach(() => vi.setSystemTime(new Date('2026-10-28T15:00:00Z')));
afterEach(() => vi.useRealTimers());

// Plans keyed by 'date|symbol', e.g. '2026-10-28|SPY'.
function serveDailyPlan(plansByKey) {
  server.use(
    http.get('*/api/daily-plan', ({ request }) => {
      const params = new URL(request.url).searchParams;
      return HttpResponse.json({ plan: plansByKey[`${params.get('tradeDate')}|${params.get('symbol')}`] ?? null });
    })
  );
}

function capturePuts(response = (body) => HttpResponse.json({ plan: body }, { status: 200 })) {
  const bodies = [];
  server.use(
    http.put('*/api/daily-plan', async ({ request }) => {
      const body = await request.json();
      bodies.push(body);
      return response(body);
    })
  );
  return bodies;
}

function renderForm() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <DailyPlanForm />
    </SWRConfig>
  );
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save plan' }));

describe('DailyPlanForm', () => {
  it("defaults to today's date with a blank form when the day has no plan", async () => {
    serveDailyPlan({});
    renderForm();

    expect(await screen.findByLabelText('Day')).toHaveValue('2026-10-28');
    expect(screen.getByLabelText('LTF 50%')).toHaveValue(null);
  });

  it('prefills an existing plan for the day', async () => {
    serveDailyPlan({
      '2026-10-28|SPY': {
        tradeDate: '2026-10-28',
        ltfDirection: 'bearish',
        ltfFib50: 670.5,
        ltfFib100: 668,
        htfDirection: null,
        htfFib50: null,
        htfFib100: null,
        notes: 'Faded the gap.',
      },
    });
    renderForm();

    expect(await screen.findByLabelText('LTF 50%')).toHaveValue(670.5);
    expect(screen.getByLabelText('LTF 100%')).toHaveValue(668);
    expect(screen.getByLabelText('Notes')).toHaveValue('Faded the gap.');
  });

  it('saves the fib extensions for the shown day', async () => {
    serveDailyPlan({});
    const bodies = capturePuts();
    renderForm();

    await screen.findByLabelText('Day');
    await userEvent.type(screen.getByLabelText('LTF 50%'), '670.5');
    await userEvent.type(screen.getByLabelText('LTF 100%'), '672');
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      tradeDate: '2026-10-28',
      symbol: 'SPY',
      ltfDirection: 'bullish',
      ltfFib50: 670.5,
      ltfFib100: 672,
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('saves a plan with no fib yet, leaving the working fib out', async () => {
    serveDailyPlan({});
    const bodies = capturePuts();
    renderForm();

    await userEvent.type(await screen.findByLabelText('Notes'), 'Asia swept the prior low');
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ tradeDate: '2026-10-28', symbol: 'SPY', notes: 'Asia swept the prior low' });
  });

  it('saves the overnight highs and lows that are filled in', async () => {
    serveDailyPlan({});
    const bodies = capturePuts();
    renderForm();

    await userEvent.type(await screen.findByLabelText('Asia high'), '683.1');
    await userEvent.type(screen.getByLabelText('Asia low'), '679.4');
    await userEvent.type(screen.getByLabelText('Premarket high'), '684');
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ tradeDate: '2026-10-28', symbol: 'SPY', asiaHigh: 683.1, asiaLow: 679.4, premarketHigh: 684 });
  });

  it('prefills the overnight levels a saved plan has', async () => {
    serveDailyPlan({ '2026-10-28|SPY': { tradeDate: '2026-10-28', londonLow: 680.5, londonHigh: null } });
    renderForm();

    expect(await screen.findByLabelText('London low')).toHaveValue(680.5);
    expect(screen.getByLabelText('London high')).toHaveValue(null);
  });

  it('shows the field errors the server sends back', async () => {
    serveDailyPlan({});
    capturePuts(() =>
      HttpResponse.json(
        { error: 'Invalid daily plan', fieldErrors: { ltfFib100: ['The 100% must be above the 50% for a bullish fib'] } },
        { status: 400 }
      )
    );
    renderForm();

    await userEvent.type(await screen.findByLabelText('LTF 50%'), '670');
    await userEvent.type(screen.getByLabelText('LTF 100%'), '1');
    await save();

    expect(await screen.findByText('The 100% must be above the 50% for a bullish fib')).toBeInTheDocument();
  });

  it('loads a different day when the date changes', async () => {
    serveDailyPlan({
      '2026-10-27|SPY': {
        tradeDate: '2026-10-27',
        ltfDirection: 'bullish',
        ltfFib50: 650,
        ltfFib100: 655,
        htfDirection: null,
        htfFib50: null,
        htfFib100: null,
        notes: null,
      },
    });
    renderForm();

    await screen.findByLabelText('Day');
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-10-27' } });

    expect(await screen.findByLabelText('LTF 50%')).toHaveValue(650);
  });

  it("defaults to SPY and loads another symbol's plan once the symbol is changed", async () => {
    serveDailyPlan({ '2026-10-28|QQQ': { tradeDate: '2026-10-28', symbol: 'QQQ', asiaHigh: 612.4 } });
    renderForm();

    const symbol = await screen.findByLabelText('Symbol');
    expect(symbol).toHaveValue('SPY');
    await userEvent.clear(symbol);
    await userEvent.type(symbol, 'qqq');
    await userEvent.tab();

    expect(await screen.findByDisplayValue('612.4')).toBeInTheDocument();
    expect(screen.getByLabelText('Symbol')).toHaveValue('QQQ');
  });

  it('saves the plan under the symbol shown', async () => {
    serveDailyPlan({});
    const bodies = capturePuts();
    renderForm();

    const symbol = await screen.findByLabelText('Symbol');
    await userEvent.clear(symbol);
    await userEvent.type(symbol, 'msft');
    await userEvent.tab();
    await userEvent.type(await screen.findByLabelText('Premarket high'), '512');
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ tradeDate: '2026-10-28', symbol: 'MSFT', premarketHigh: 512 });
  });

  it('keeps the symbol when it is cleared and left blank', async () => {
    serveDailyPlan({});
    renderForm();

    const symbol = await screen.findByLabelText('Symbol');
    await userEvent.clear(symbol);
    await userEvent.tab();

    expect(await screen.findByLabelText('Symbol')).toHaveValue('SPY');
  });

  it('loads the typed symbol when Enter is pressed in it, rather than saving under the old one', async () => {
    serveDailyPlan({ '2026-10-28|QQQ': { tradeDate: '2026-10-28', symbol: 'QQQ', asiaHigh: 612.4 } });
    const bodies = capturePuts();
    renderForm();

    const symbol = await screen.findByLabelText('Symbol');
    await userEvent.clear(symbol);
    await userEvent.type(symbol, 'qqq{Enter}');

    expect(await screen.findByDisplayValue('612.4')).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it('says a symbol is invalid and keeps the form, instead of loading it', async () => {
    serveDailyPlan({});
    renderForm();

    const symbol = await screen.findByLabelText('Symbol');
    await userEvent.clear(symbol);
    await userEvent.type(symbol, 'S P Y');
    await userEvent.tab();

    expect(await screen.findByText('Invalid symbol')).toBeInTheDocument();
    expect(screen.getByLabelText('Day')).toBeInTheDocument();
    expect(screen.getByLabelText('Symbol')).toHaveValue('S P Y');
  });
});
