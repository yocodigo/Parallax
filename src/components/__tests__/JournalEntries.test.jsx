import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import JournalEntries from '../JournalEntries';

const trade = {
  id: '6f1c2a4e-0000-4000-8000-000000000001',
  mode: 'paper',
  symbol: 'AAPL',
  assetClass: 'stock',
  direction: 'long',
  quantity: 100,
  multiplier: 1,
  plannedEntry: 210,
  initialStop: 205,
  target: 220,
};

// Shaped like a row from GET /api/journal: the entry plus its trade, or null.
function entry(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    tradeId: null,
    kind: 'review',
    symbol: null,
    notes: 'Some notes',
    emotion: null,
    mistakes: [],
    createdAt: '2026-10-20T14:30:00.000Z',
    updatedAt: '2026-10-20T14:30:00.000Z',
    trade: null,
    ...overrides,
  };
}

function serveJournal(response) {
  server.use(http.get('*/api/journal', () => response));
}

function renderEntries() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <JournalEntries />
    </SWRConfig>
  );
}

describe('JournalEntries', () => {
  it('lists each entry with its kind and notes', async () => {
    serveJournal(
      HttpResponse.json({
        entries: [
          entry({ kind: 'thesis', symbol: 'MSFT', notes: 'Cloud growth is underpriced.' }),
          entry({ kind: 'review', notes: 'Held past my target.' }),
        ],
      })
    );
    renderEntries();

    expect(await screen.findByText('Cloud growth is underpriced.')).toBeInTheDocument();
    expect(screen.getByText('Held past my target.')).toBeInTheDocument();
    expect(screen.getByText('Thesis')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
  });

  it('shows the trade an entry is linked to', async () => {
    serveJournal(
      HttpResponse.json({
        entries: [entry({ kind: 'plan', tradeId: trade.id, notes: 'Breakout over 210.', trade })],
      })
    );
    renderEntries();

    expect(await screen.findByText('Long 100 AAPL')).toBeInTheDocument();
    expect(screen.getByText('Paper')).toBeInTheDocument();
  });

  it('shows the emotion and mistakes with friendly labels', async () => {
    serveJournal(
      HttpResponse.json({
        entries: [
          entry({ notes: 'Chased it.', emotion: 'fomo', mistakes: ['entered_late', 'moved_stop'] }),
        ],
      })
    );
    renderEntries();

    expect(await screen.findByText('FOMO')).toBeInTheDocument();
    expect(screen.getByText('Entered late')).toBeInTheDocument();
    expect(screen.getByText('Moved stop')).toBeInTheDocument();
  });

  it('says so when the journal is empty', async () => {
    serveJournal(HttpResponse.json({ entries: [] }));
    renderEntries();

    expect(await screen.findByText('No journal entries yet.')).toBeInTheDocument();
  });

  it('shows the contract of an option trade', async () => {
    const option = {
      ...trade,
      id: '6f1c2a4e-0000-4000-8000-000000000002',
      symbol: 'SPY',
      assetClass: 'option',
      quantity: 2,
      multiplier: 100,
      optionType: 'call',
      strike: 500,
      expiration: '2026-01-16',
    };
    serveJournal(HttpResponse.json({ entries: [entry({ kind: 'plan', tradeId: option.id, trade: option })] }));
    renderEntries();

    expect(await screen.findByText('Long 2 SPY 500C exp Jan 16')).toBeInTheDocument();
  });

  it('shows the error when the journal cannot be loaded', async () => {
    serveJournal(
      HttpResponse.json({ error: 'Database unavailable', requestId: 'req-123' }, { status: 500 })
    );
    renderEntries();

    expect(await screen.findByText('Database unavailable (Reference: req-123)')).toBeInTheDocument();
  });
});
