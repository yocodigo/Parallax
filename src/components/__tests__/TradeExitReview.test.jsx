import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import TradeExitReview from '../TradeExitReview';

const TRADE_ID = '6f1c2a4e-0000-4000-8000-000000000004';

const review = (overrides = {}) => ({
  bias: 'long',
  t1: 100,
  t2: 102,
  skipped: null,
  reaction: {
    kind: 'rejected',
    touchAt: '2026-10-27T13:50:00.000Z',
    decidedAt: '2026-10-27T13:51:00.000Z',
  },
  exitUnderlying: 99.3,
  verdict: 'matched',
  ...overrides,
});

function serveReview(body) {
  server.use(http.get(`*/api/trades/${TRADE_ID}/exit-review`, () => HttpResponse.json(body)));
}

function renderReview(exitReason = 'fib_rejection') {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <TradeExitReview tradeId={TRADE_ID} exitReason={exitReason} />
    </SWRConfig>
  );
}

describe('TradeExitReview', () => {
  it('shows the targets, the reaction at T1 with its New York touch time, and the verdict', async () => {
    serveReview({ review: review() });
    renderReview();

    expect(await screen.findByText('T1 100.00, T2 102.00')).toBeInTheDocument();
    expect(screen.getByText('Rejected at T1, touched 9:50 AM')).toBeInTheDocument();
    expect(screen.getByText('Exit matched step 5')).toBeInTheDocument();
  });

  it('shows the underlying at the exit beside the reason the trader recorded', async () => {
    serveReview({ review: review() });
    renderReview('planned_partial');

    expect(await screen.findByText('Underlying at exit 99.30, recorded reason: Planned partial')).toBeInTheDocument();
  });

  it('words each reaction and verdict', async () => {
    serveReview({
      review: review({
        reaction: { kind: 'ripped', touchAt: '2026-10-27T13:50:00.000Z', decidedAt: '2026-10-27T13:54:00.000Z' },
        verdict: 'early',
      }),
    });
    const { unmount } = renderReview();
    expect(await screen.findByText('Ripped through T1, touched 9:50 AM')).toBeInTheDocument();
    expect(screen.getByText('Exit was early against step 5')).toBeInTheDocument();
    unmount();

    serveReview({
      review: review({
        reaction: {
          kind: 'oscillating',
          touchAt: '2026-10-27T13:50:00.000Z',
          decidedAt: '2026-10-27T13:52:00.000Z',
          drifting: true,
        },
        verdict: 'not_judged',
      }),
    });
    renderReview();
    expect(await screen.findByText('Oscillated at T1, drifting the trade’s way, touched 9:50 AM')).toBeInTheDocument();
    expect(screen.getByText('Not judged: one exit per trade can’t show a partial')).toBeInTheDocument();
  });

  it('says so when price never reached T1, or the exit came before it did', async () => {
    serveReview({ review: review({ reaction: null, verdict: 'not_reached' }) });
    const { unmount } = renderReview();
    expect(await screen.findByText('Price never reached T1')).toBeInTheDocument();
    unmount();

    serveReview({ review: review({ verdict: 'before_t1' }) });
    renderReview();
    expect(await screen.findByText('Exited before T1 was touched')).toBeInTheDocument();
  });

  it.each([
    ['no_daily_plan', 'No fib plan was recorded for that day, so there was no T1'],
    ['fib_not_on_trade_side', 'The day’s 50% wasn’t ahead of the fill, so there was no T1'],
    ['not_intraday', 'Held past the session, so step 5 doesn’t apply'],
    ['no_bars', 'No bars to grade this from'],
  ])('says why a %s review has no verdict', async (skipped, message) => {
    serveReview({ review: review({ skipped, t1: null, t2: null, reaction: null, verdict: null }) });
    renderReview();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/T1 \d/)).not.toBeInTheDocument();
  });

  it('explains why there is no review', async () => {
    serveReview({ review: null, reason: 'The exit review is only available for stocks and options so far' });
    renderReview();

    expect(
      await screen.findByText('The exit review is only available for stocks and options so far')
    ).toBeInTheDocument();
  });
});
