import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { usePathname, useRouter } from 'next/navigation';
import { server } from '@/mocks/server';
import EntryCoaching from '../EntryCoaching';
import JournalEntries from '../JournalEntries';
import SiteNav from '../SiteNav';
import TradeScreenshots from '../TradeScreenshots';

// The public demo hides every control that would write, since the proxy
// refuses the request anyway; what's already there stays readable.
vi.mock('next/navigation', () => ({ usePathname: vi.fn(), useRouter: vi.fn() }));

const TRADE_ID = '6f1c2a4e-0000-4000-8000-000000000001';

const withSwr = (ui) => (
  <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>{ui}</SWRConfig>
);

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
  usePathname.mockReturnValue('/journal');
  useRouter.mockReturnValue({ replace: vi.fn(), refresh: vi.fn() });
});
afterEach(() => vi.unstubAllEnvs());

describe('in the demo', () => {
  it('lists journal entries without delete or record buttons', async () => {
    const plan = {
      id: 'entry-1',
      tradeId: TRADE_ID,
      kind: 'plan',
      symbol: 'AAPL',
      notes: 'Breakout over 210.',
      emotion: null,
      mistakes: [],
      createdAt: '2026-10-20T14:30:00.000Z',
      updatedAt: '2026-10-20T14:30:00.000Z',
      trade: {
        id: TRADE_ID,
        mode: 'paper',
        symbol: 'AAPL',
        assetClass: 'stock',
        direction: 'long',
        quantity: 100,
        multiplier: 1,
        plannedEntry: 210,
        initialStop: 205,
        target: 220,
        openedAt: null,
      },
    };
    server.use(http.get('*/api/journal', () => HttpResponse.json({ entries: [plan] })));
    render(withSwr(<JournalEntries />));

    expect(await screen.findByText('Breakout over 210.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /record entry/i })).not.toBeInTheDocument();
  });

  it('shows stored coaching without the button that pays for more', () => {
    render(
      <EntryCoaching
        entry={{ id: 'entry-1', coaching: 'You waited for the cross.', coachedAt: '2026-10-20T21:00:00.000Z' }}
      />
    );

    expect(screen.getByText('You waited for the cross.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows nothing for a review that was never coached', () => {
    const { container } = render(<EntryCoaching entry={{ id: 'entry-1', coaching: null, coachedAt: null }} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows screenshots without upload or remove', async () => {
    server.use(
      http.get(`*/api/trades/${TRADE_ID}/screenshots`, () =>
        HttpResponse.json({
          screenshots: [{ id: 'a1', label: 'setup', contentType: 'image/png', createdAt: '2026-10-30T15:00:00.000Z' }],
        })
      )
    );
    render(withSwr(<TradeScreenshots tradeId={TRADE_ID} />));

    expect(await screen.findByRole('img')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Screenshot image')).not.toBeInTheDocument();
  });

  it('has no sign-out in the nav, and says it is a demo', () => {
    render(<SiteNav />);

    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.getByText(/demo/i)).toBeInTheDocument();
  });
});
