import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import FidelityImport from '../FidelityImport';

// jsdom's Blob and FormData can't be read by Node's fetch, so an upload
// never finishes; use Node's, as VoiceNote.test.jsx does.
let NodeFormData;
beforeAll(async () => {
  NodeFormData = (await new Response(new URLSearchParams('a=1')).formData()).constructor;
});
beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('FormData', NodeFormData);
});
afterEach(() => vi.unstubAllGlobals());

const trade = (overrides) => ({
  symbol: 'WDGT',
  assetClass: 'stock',
  direction: 'long',
  quantity: 40,
  entryPrice: 20.25,
  openedAt: '2026-10-09T13:30:00.000Z',
  exitPrice: 25,
  closedAt: '2026-10-16T13:30:00.000Z',
  fees: 0.05,
  refs: ['1', '2', '3'],
  fillCount: 3,
  profitLoss: 189.75,
  action: 'create',
  ...overrides,
});

const preview = {
  trades: [
    trade({}),
    trade({
      action: 'fill',
      tradeId: 'plan-1',
      entryPrice: 30,
      openedAt: '2026-10-12T13:30:00.000Z',
      exitPrice: 28,
      profitLoss: -80,
      fillCount: 2,
    }),
    trade({ action: 'skip', tradeId: 'old-1', openedAt: '2026-10-05T13:30:00.000Z', fillCount: 2 }),
  ],
  unpaired: [
    {
      reason: 'Closes a position opened before this statement',
      fills: [{ symbol: 'WDGT', ref: '9', side: 'sell', quantity: 10, price: 24, executedAt: '2026-09-28T13:30:00.000Z' }],
    },
  ],
  unreadRows: [{ description: 'DIVIDEND RECEIVED WIDGET CO COM (WDGT)' }],
  applied: false,
};

// Serve the import route, recording each form posted.
function serveImport(respond = (form) => ({ ...preview, ...(form.confirm && { applied: true, created: 1, filled: 1 }) })) {
  const posted = [];
  server.use(
    http.post('*/api/imports/fidelity', async ({ request }) => {
      const form = await request.formData();
      const fields = {
        fileName: form.get('file')?.name,
        mode: form.get('mode'),
        confirm: form.get('confirm') === 'true',
      };
      posted.push(fields);
      const body = respond(fields);
      return HttpResponse.json(body, { status: body.status ?? 200 });
    })
  );
  return posted;
}

const history = () => new NodeFile(['Run Date,Action\n'], 'History_for_Account_0000.csv', { type: 'text/csv' });

async function choosePreview() {
  await userEvent.upload(screen.getByLabelText('Account history (CSV)'), history());
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
}

describe('FidelityImport', () => {
  it('previews the trades with what the import will do with each, in New York dates', async () => {
    const posted = serveImport();
    render(<FidelityImport />);

    await choosePreview();

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'Oct 9',
      'WDGTaveraged from 3 fills',
      '40',
      '20.25 → 25',
      '+$189.75',
      'New trade',
    ]);
    expect(within(rows[2]).getByText('Fills in your trade')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Already imported')).toBeInTheDocument();
    expect(posted).toEqual([{ fileName: 'History_for_Account_0000.csv', mode: 'live', confirm: false }]);
  });

  it('lists what it could not pair or read', async () => {
    serveImport();
    render(<FidelityImport />);

    await choosePreview();

    expect(await screen.findByText(/Closes a position opened before this statement/)).toBeInTheDocument();
    expect(screen.getByText(/Sold 10 WDGT at 24, Sep 28/)).toBeInTheDocument();
    expect(screen.getByText('DIVIDEND RECEIVED WIDGET CO COM (WDGT)')).toBeInTheDocument();
  });

  it('imports when confirmed and says what changed', async () => {
    const posted = serveImport();
    render(<FidelityImport />);
    await choosePreview();

    await userEvent.click(await screen.findByRole('button', { name: 'Import 2 trades' }));

    expect(await screen.findByText('Imported: 1 new trade, 1 filled in.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See them in the journal' })).toHaveAttribute('href', '/journal');
    expect(posted.map((p) => p.confirm)).toEqual([false, true]);
  });

  it('asks for a new preview after the mode changes', async () => {
    const posted = serveImport();
    render(<FidelityImport />);
    await choosePreview();
    await screen.findByRole('table');

    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'paper');

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('table');
    expect(posted[1]).toMatchObject({ mode: 'paper' });
  });

  it('offers no import when every trade was imported before', async () => {
    serveImport(() => ({ ...preview, trades: [trade({ action: 'skip', tradeId: 'old-1' })], unpaired: [], unreadRows: [] }));
    render(<FidelityImport />);

    await choosePreview();

    expect(await screen.findByText('Nothing new to import.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Import/ })).not.toBeInTheDocument();
  });

  it("shows the server's message under the file", async () => {
    const message = 'This is not a Fidelity account history: it has no Run Date column.';
    serveImport(() => ({ status: 400, error: message, fieldErrors: { file: [message] } }));
    render(<FidelityImport />);

    await choosePreview();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText('Account history (CSV)')).toHaveAttribute('aria-invalid', 'true');
  });
});
