import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import TradeReview from '../TradeReview';

const TRADE_ID = '6f1c2a4e-0000-4000-8000-000000000003';

const review = (overrides = {}) => ({
  bias: 'long',
  setup: {
    name: 'band_cross',
    crossAt: '2026-10-27T14:30:00.000Z',
    entryAt: '2026-10-27T14:45:00.000Z',
    idealEntry: 12.5,
    idealStop: 12.05,
    risingVolume: true,
  },
  chaseR: 0.67,
  entryCandle: { overlap: 0.08, volumeVsPrevious: 1.6, risingVolume: true },
  room: { distance: 0.46, needed: 0.12, ok: true },
  fourTouch: null,
  inLockout: false,
  midRange: false,
  pressureDate: false,
  seasonalDate: null,
  ...overrides,
});

function serveReview(body) {
  server.use(http.get(`*/api/trades/${TRADE_ID}/review`, () => HttpResponse.json(body)));
}

function renderReview() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <TradeReview tradeId={TRADE_ID} />
    </SWRConfig>
  );
}

describe('TradeReview', () => {
  it('shows the setup with its ideal entry and stop, and how far the fill chased it', async () => {
    serveReview({ review: review() });
    renderReview();

    expect(await screen.findByText('15m band cross: ideal entry 12.50, stop 12.05')).toBeInTheDocument();
    expect(screen.getByText('Chased 0.7R past the ideal entry')).toBeInTheDocument();
  });

  it('says so when the fill beat the ideal entry or had no setup to measure against', async () => {
    serveReview({ review: review({ chaseR: -0.34 }) });
    const { unmount } = renderReview();
    expect(await screen.findByText('Filled 0.3R better than the ideal entry')).toBeInTheDocument();
    unmount();

    serveReview({ review: review({ setup: null, chaseR: null }) });
    renderReview();
    expect(await screen.findByText('No 15m band cross entry had formed')).toBeInTheDocument();
    expect(screen.queryByText(/ideal entry/)).not.toBeInTheDocument();
  });

  it('shows the 5m entry candle and the 1m room', async () => {
    serveReview({ review: review() });
    renderReview();

    expect(await screen.findByText('Overlap 8% of the previous 5m bar, volume 1.6× it')).toBeInTheDocument();
    expect(screen.getByText('Room to the 1m outer band: 0.46 (needs 0.12)')).toBeInTheDocument();
  });

  it('shows the four-touch line with its grade', async () => {
    serveReview({
      review: review({
        fourTouch: { timeframe: '5m', kind: '4xBO', status: 'valid', grade: { grade: 'A' }, brokeAt: 'x' },
      }),
    });
    renderReview();

    expect(await screen.findByText('4xBO on the 5m, valid, grade A')).toBeInTheDocument();
  });

  it('flags a lockout, a mid-range entry, and the calendar dates', async () => {
    serveReview({
      review: review({ inLockout: true, midRange: true, pressureDate: true, seasonalDate: '09-23' }),
    });
    renderReview();

    expect(await screen.findByText('In a lockout window')).toBeInTheDocument();
    expect(screen.getByText('Mid-range entry')).toBeInTheDocument();
    expect(screen.getByText('Pressure date')).toBeInTheDocument();
    expect(screen.getByText('Gann date 09-23')).toBeInTheDocument();
  });

  it('says there were no flags when none apply', async () => {
    serveReview({ review: review() });
    renderReview();

    expect(await screen.findByText('No lockout, mid-range, or calendar flags')).toBeInTheDocument();
  });

  it('explains why there is no review', async () => {
    serveReview({ review: null, reason: 'The entry review is only available for stocks and options so far' });
    renderReview();

    expect(
      await screen.findByText('The entry review is only available for stocks and options so far')
    ).toBeInTheDocument();
  });
});
