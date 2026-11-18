import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import TradeGates from '../TradeGates';

const TRADE_ID = '6f1c2a4e-0000-4000-8000-000000000002';

function serveGates(body) {
  server.use(http.get(`*/api/trades/${TRADE_ID}/gates`, () => HttpResponse.json(body)));
}

function renderGates() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <TradeGates tradeId={TRADE_ID} />
    </SWRConfig>
  );
}

describe('TradeGates', () => {
  it('shows each gate, in the setups.md order, met or missed', async () => {
    serveGates({
      gates: {
        window: 'met',
        direction: 'missed',
        entry: 'met',
        location: 'unknown',
        target: 'met',
        state: 'met',
        stop: 'met',
      },
    });
    renderGates();

    expect(await screen.findByText('Window OK')).toBeInTheDocument();
    expect(screen.getByText('Direction missed')).toBeInTheDocument();
    expect(screen.getByText('Location ?')).toBeInTheDocument();

    // Order follows the setups.md table: Window, Direction, Entry, Location,
    // Stop, Target, State (Size is left out here, a stock trade).
    const labels = screen.getAllByText(/OK|missed|\?/).map((el) => el.textContent);
    expect(labels).toEqual([
      'Window OK',
      'Direction missed',
      'Entry OK',
      'Location ?',
      'Stop OK',
      'Target OK',
      'State OK',
    ]);
  });

  it("shows Size for an option trade, where it's graded", async () => {
    serveGates({
      gates: {
        window: 'met',
        size: 'met',
        direction: 'met',
        entry: 'met',
        location: 'met',
        target: 'met',
        state: 'met',
        stop: 'met',
      },
    });
    renderGates();

    const labels = await screen.findAllByText(/OK|missed|\?/);
    expect(labels.map((el) => el.textContent)).toEqual([
      'Window OK',
      'Size OK',
      'Direction OK',
      'Entry OK',
      'Location OK',
      'Stop OK',
      'Target OK',
      'State OK',
    ]);
  });

  it('explains why there are no gates to grade', async () => {
    serveGates({ gates: null, reason: 'Gates are only available for stocks and options so far' });
    renderGates();

    expect(
      await screen.findByText('Gates are only available for stocks and options so far')
    ).toBeInTheDocument();
  });

  const GATES = { window: 'unknown', direction: 'met', entry: 'met', location: 'met', target: 'met', state: 'met', stop: 'met' };

  it('names the level Location was met at, and the room to the next level in points and R', async () => {
    serveGates({
      gates: GATES,
      location: { status: 'met', level: { kind: 'prior_day_high', price: 681.5, tier: 1 }, event: 'accepted', at: '2026-10-27T14:12:00.000Z' },
      room: { level: { kind: 'round', price: 685, tier: 3 }, points: 2.25, risk: 0.75, ratio: 3 },
    });
    renderGates();

    expect(await screen.findByText('At the prior day high 681.50, broken and accepted at 10:12 AM')).toBeInTheDocument();
    expect(screen.getByText('Room: 2.25 pts to the round number 685.00, 3.0 times the 0.75 pts to the stop')).toBeInTheDocument();
  });

  it('says when the entry was floating and when room has no stop or no level to measure', async () => {
    serveGates({
      gates: { ...GATES, location: 'missed' },
      location: { status: 'missed', level: null, event: null, at: null },
      room: { level: { kind: 'equal_highs_5m', price: 682, tier: 1 }, points: 1.5, risk: null, ratio: null },
    });
    renderGates();

    expect(await screen.findByText('Floating: no tier 1 or 2 level nearby had been broken or swept its way')).toBeInTheDocument();
    expect(screen.getByText('Room: 1.50 pts to the 5m equal highs 682.00 (no stop to compare it with)')).toBeInTheDocument();
  });

  it('says when no untouched level lies ahead', async () => {
    serveGates({
      gates: GATES,
      location: { status: 'unknown', level: null, event: null, at: null },
      room: { level: null, points: null, risk: 0.5, ratio: null },
    });
    renderGates();

    expect(await screen.findByText('Room: no untouched level ahead')).toBeInTheDocument();
    expect(screen.queryByText(/Floating/)).not.toBeInTheDocument();
  });
});

describe('TradeGates for a strategy tied to a detector', () => {
  const base = { window: 'unknown', location: 'unknown', target: 'met', state: 'met', stop: 'met' };

  it('shows the Setup gate after Entry, and the setup the detector found', async () => {
    serveGates({
      gates: { ...base, setup: 'met' },
      setup: { detector: 'four_touch', timeframe: '1m', direction: 'short', status: 'valid', grade: 'A', barsSince: 1 },
    });
    renderGates();

    expect(await screen.findByText('Setup OK')).toBeInTheDocument();
    expect(screen.getByText('Setup: four-touch break on the 1m, valid, grade A, 1 bar before the fill')).toBeInTheDocument();
  });

  it("says the setup wasn't there, or wasn't there to trade", async () => {
    serveGates({ gates: { ...base, setup: 'missed' }, setup: null });
    const { unmount } = renderGates();
    expect(await screen.findByText('Setup: none found within 3 bars of the fill')).toBeInTheDocument();
    unmount();

    serveGates({
      gates: { ...base, direction: 'met', entry: 'met', setup: 'missed' },
      setup: { detector: 'band_cross', timeframe: '5m', direction: 'long', status: 'no_room', grade: null, barsSince: 0 },
    });
    renderGates();
    expect(await screen.findByText('Setup: 15m band cross, no room to the 1m band, 0 bars before the fill')).toBeInTheDocument();
  });

  it("says nothing of the setup when it couldn't be judged", async () => {
    serveGates({ gates: { ...base, setup: 'unknown' } });
    renderGates();
    expect(await screen.findByText('Setup ?')).toBeInTheDocument();
    expect(screen.queryByText(/^Setup:/)).not.toBeInTheDocument();
  });
});
