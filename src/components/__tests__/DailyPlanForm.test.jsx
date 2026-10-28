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

function serveDailyPlan(plansByDate) {
  server.use(
    http.get('*/api/daily-plan', ({ request }) => {
      const tradeDate = new URL(request.url).searchParams.get('tradeDate');
      return HttpResponse.json({ plan: plansByDate[tradeDate] ?? null });
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
      '2026-10-28': {
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
      ltfDirection: 'bullish',
      ltfFib50: 670.5,
      ltfFib100: 672,
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
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
      '2026-10-27': {
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
});
