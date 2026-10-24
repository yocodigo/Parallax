import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import ThinkorswimImport from '../ThinkorswimImport';

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

const PUT = { symbol: 'SPY', assetClass: 'option', optionType: 'put', strike: 761, expiration: '2026-10-23', multiplier: 100 };

const trade = (overrides) => ({
  ...PUT,
  direction: 'long',
  quantity: 1,
  entryPrice: 1.3,
  openedAt: '2026-10-23T18:41:05.000Z',
  exitPrice: 1.17,
  closedAt: '2026-10-23T18:42:53.000Z',
  fees: 1.32,
  refs: ['1', '2'],
  fillCount: 2,
  profitLoss: -14.32,
  action: 'create',
  ...overrides,
});

const preview = {
  trades: [
    trade({}),
    trade({
      action: 'fill',
      tradeId: 'plan-1',
      entryPrice: 0.94,
      openedAt: '2026-10-23T19:22:46.000Z',
      exitPrice: 0.98,
      profitLoss: 2.68,
    }),
    trade({ action: 'skip', tradeId: 'old-1', openedAt: '2026-10-23T19:39:37.000Z', fillCount: 4 }),
  ],
  unpaired: [
    {
      reason: 'Closes a position opened before this statement',
      fills: [{ ...PUT, ref: '9', side: 'sell', quantity: 1, price: 2.5, executedAt: '2026-10-23T16:40:00.000Z' }],
    },
  ],
  unreadRows: [{ ref: '5', description: 'BOT +10 AAPL @250.00' }],
  applied: false,
};

// Serve the import route, recording each form posted.
function serveImport(respond = (form) => ({ ...preview, ...(form.confirm && { applied: true, created: 1, filled: 1 }) })) {
  const posted = [];
  server.use(
    http.post('*/api/imports/thinkorswim', async ({ request }) => {
      const form = await request.formData();
      const fields = {
        fileName: form.get('file')?.name,
        timeZone: form.get('timeZone'),
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

const statement = () => new NodeFile(['Cash Balance\n'], '2026-10-23-AccountStatement.csv', { type: 'text/csv' });

async function choosePreview() {
  await userEvent.upload(screen.getByLabelText('Account statement (CSV)'), statement());
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
}

describe('ThinkorswimImport', () => {
  it('previews the trades with what the import will do with each, in Pacific time by default', async () => {
    const posted = serveImport();
    render(<ThinkorswimImport />);

    await choosePreview();

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'Oct 23, 11:41 AM',
      'SPY 761P exp Oct 23',
      '1',
      '1.3 → 1.17',
      '-$14.32',
      'New trade',
    ]);
    expect(within(rows[2]).getByText('Fills in your trade')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Already imported')).toBeInTheDocument();
    // Scaled in or out: the prices shown are averages.
    expect(within(rows[3]).getByText('averaged from 4 fills')).toBeInTheDocument();
    expect(posted).toEqual([
      { fileName: '2026-10-23-AccountStatement.csv', timeZone: 'America/Los_Angeles', mode: 'live', confirm: false },
    ]);
  });

  it('lists what it could not pair or read', async () => {
    serveImport();
    render(<ThinkorswimImport />);

    await choosePreview();

    expect(await screen.findByText(/Closes a position opened before this statement/)).toBeInTheDocument();
    expect(screen.getByText(/Sold 1 SPY 761P exp Oct 23 at 2.5/)).toBeInTheDocument();
    expect(screen.getByText('BOT +10 AAPL @250.00')).toBeInTheDocument();
  });

  it('imports when confirmed and says what changed', async () => {
    const posted = serveImport();
    render(<ThinkorswimImport />);
    await choosePreview();

    await userEvent.click(await screen.findByRole('button', { name: 'Import 2 trades' }));

    expect(await screen.findByText('Imported: 1 new trade, 1 filled in.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See them in the journal' })).toHaveAttribute('href', '/journal');
    expect(posted.map((p) => p.confirm)).toEqual([false, true]);
  });

  it('sends the chosen time zone and mode, and asks for a new preview after a change', async () => {
    const posted = serveImport();
    render(<ThinkorswimImport />);
    await choosePreview();
    await screen.findByRole('table');

    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'paper');

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('thinkorswim time zone'), 'America/New_York');
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('table');
    expect(posted[1]).toMatchObject({ timeZone: 'America/New_York', mode: 'paper' });
  });

  it('offers no import when every trade was imported before', async () => {
    serveImport(() => ({ ...preview, trades: [trade({ action: 'skip', tradeId: 'old-1' })], unpaired: [], unreadRows: [] }));
    render(<ThinkorswimImport />);

    await choosePreview();

    expect(await screen.findByText('Nothing new to import.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Import/ })).not.toBeInTheDocument();
  });

  it("shows the server's message under the file", async () => {
    const message = 'This is not a thinkorswim account statement: it has no Cash Balance section.';
    serveImport(() => ({ status: 400, error: message, fieldErrors: { file: [message] } }));
    render(<ThinkorswimImport />);

    await choosePreview();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText('Account statement (CSV)')).toHaveAttribute('aria-invalid', 'true');
  });
});
