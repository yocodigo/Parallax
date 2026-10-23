import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import TradeContext from '../TradeContext';

const TRADE_ID = '6f1c2a4e-0000-4000-8000-000000000001';

const context = {
  version: 1,
  timeOfDay: { sessionPart: 'midday', minutesSinceOpen: 60 },
  market: {
    spyTrend: 'up',
    qqqTrend: 'sideways',
    vix: { close: 16.68, date: '2026-10-21', direction: 'flat' },
    events: { today: ['FOMC decision'], nextWeekday: [] },
  },
  stock: { symbol: 'NVDA', price: 215.11, trend: 'sideways', gapPercent: -2.15, relativeVolume: 2.29, relativeStrength: -3.71 },
  option: null,
  unavailable: ['sectorTrend', 'earnings', 'exDividend', 'ivRank'],
};

function serveContext(body) {
  server.use(http.get(`*/api/trades/${TRADE_ID}/context`, () => HttpResponse.json(body)));
}

function renderContext() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <TradeContext tradeId={TRADE_ID} />
    </SWRConfig>
  );
}

describe('TradeContext', () => {
  it('shows the market, the stock, and the time of day at entry', async () => {
    serveContext({ context });
    renderContext();

    expect(await screen.findByText('Midday, 60 minutes after the open')).toBeInTheDocument();
    expect(screen.getByText('SPY up · QQQ sideways · VIX 16.68 (flat)')).toBeInTheDocument();
    expect(screen.getByText('That day: FOMC decision. Next weekday: none.')).toBeInTheDocument();
    expect(
      screen.getByText('NVDA at 215.11: trend sideways · gap -2.15% · relative volume 2.29× · vs SPY (20 days) -3.71 pts')
    ).toBeInTheDocument();
    expect(screen.getByText('Not captured: sector trend, earnings, ex-dividend dates, IV rank.')).toBeInTheDocument();
  });

  it('marks values that could not be fetched, and releases that are unknown for the date', async () => {
    serveContext({
      context: {
        ...context,
        timeOfDay: { sessionPart: null, minutesSinceOpen: null },
        market: { spyTrend: null, qqqTrend: null, vix: null, events: null },
        stock: { symbol: 'NVDA', price: null, trend: null, gapPercent: null, relativeVolume: null, relativeStrength: null },
      },
    });
    renderContext();

    expect(await screen.findByText('Outside regular hours')).toBeInTheDocument();
    expect(screen.getByText('SPY n/a · QQQ n/a · VIX n/a')).toBeInTheDocument();
    expect(screen.getByText('Scheduled releases: unknown for this date.')).toBeInTheDocument();
  });

  it("shows an option's contract details", async () => {
    serveContext({
      context: {
        ...context,
        option: {
          contract: 'SPY261023C00776000',
          dte: 1,
          openInterest: 4583,
          bid: 0.07,
          ask: 0.12,
          spreadPercent: 52.63,
          iv: 0.1649,
          delta: 0.0363,
          expectedMove: 5.97,
          liveSkipped: false,
        },
      },
    });
    renderContext();

    expect(
      await screen.findByText(
        '1 DTE · open interest 4,583 · bid 0.07 / ask 0.12 (spread 52.63%) · IV 16.5% · delta 0.04 · expected move ±5.97'
      )
    ).toBeInTheDocument();
  });

  it('explains a skipped quote', async () => {
    serveContext({
      context: {
        ...context,
        option: {
          contract: 'SPY261023C00776000',
          dte: 1,
          openInterest: 4583,
          bid: null,
          ask: null,
          spreadPercent: null,
          iv: null,
          delta: null,
          expectedMove: null,
          liveSkipped: true,
        },
      },
    });
    renderContext();

    expect(
      await screen.findByText(
        'Quote, IV, and delta not captured: the entry was recorded more than 15 minutes after the fill.'
      )
    ).toBeInTheDocument();
  });

  it('says when no context was captured', async () => {
    serveContext({ context: null });
    renderContext();

    expect(await screen.findByText('No context was captured for this entry.')).toBeInTheDocument();
  });
});
