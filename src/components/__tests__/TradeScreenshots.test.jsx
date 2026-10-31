import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import TradeScreenshots from '../TradeScreenshots';

const TRADE_ID = '6f1c2a4e-0000-4000-8000-000000000001';
const LIST_URL = `*/api/trades/${TRADE_ID}/screenshots`;

// jsdom's Blob and FormData can't be read by Node's fetch, so an upload would
// never finish; use Node's, as VoiceNote.test.jsx does.
let NodeFormData;
beforeAll(async () => {
  NodeFormData = (await new Response(new URLSearchParams('a=1')).formData()).constructor;
});

beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  vi.stubGlobal('FormData', NodeFormData);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const shot = (id, label) => ({ id, label, contentType: 'image/png', createdAt: '2026-10-30T15:00:00.000Z' });

function renderShots() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <TradeScreenshots tradeId={TRADE_ID} />
    </SWRConfig>
  );
}

describe('TradeScreenshots', () => {
  it('lists the trade’s screenshots as images with their labels', async () => {
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json({ screenshots: [shot('a1', 'setup'), shot('b2', null)] })
      )
    );
    renderShots();

    const setup = await screen.findByRole('img', { name: 'Setup screenshot' });
    expect(setup).toHaveAttribute('src', `/api/trades/${TRADE_ID}/screenshots/a1`);
    expect(screen.getByRole('img', { name: 'Screenshot' })).toHaveAttribute(
      'src',
      `/api/trades/${TRADE_ID}/screenshots/b2`
    );
  });

  it('uploads a picked image with its label, then shows the new list', async () => {
    let shots = [];
    let posted;
    server.use(
      http.get(LIST_URL, () => HttpResponse.json({ screenshots: shots })),
      http.post(LIST_URL, async ({ request }) => {
        posted = await request.formData();
        shots = [shot('c3', 'entry')];
        return HttpResponse.json({ screenshot: shots[0] }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    renderShots();

    await screen.findByText('No screenshots yet.');
    await user.selectOptions(screen.getByLabelText('Label'), 'entry');
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'chart.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Screenshot image'), file);
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(await screen.findByRole('img', { name: 'Entry screenshot' })).toBeInTheDocument();
    expect(posted.get('label')).toBe('entry');
    expect(posted.get('image').name).toBe('chart.png');
  });

  it('shows the server’s field error when an upload is rejected', async () => {
    server.use(
      http.get(LIST_URL, () => HttpResponse.json({ screenshots: [] })),
      http.post(LIST_URL, () =>
        HttpResponse.json(
          { error: 'Invalid screenshot', fieldErrors: { image: ['Only PNG, JPEG, or WebP images'] } },
          { status: 400 }
        )
      )
    );
    const user = userEvent.setup();
    renderShots();

    await screen.findByText('No screenshots yet.');
    const file = new File(['not an image'], 'chart.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('Screenshot image'), file);
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(await screen.findByText('Only PNG, JPEG, or WebP images')).toBeInTheDocument();
  });

  it('removes a screenshot after confirming, then reloads the list', async () => {
    let shots = [shot('a1', 'setup')];
    let deleted;
    server.use(
      http.get(LIST_URL, () => HttpResponse.json({ screenshots: shots })),
      http.delete(`${LIST_URL}/a1`, () => {
        deleted = true;
        shots = [];
        return new HttpResponse(null, { status: 204 });
      })
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderShots();

    await screen.findByRole('img', { name: 'Setup screenshot' });
    await user.click(screen.getByRole('button', { name: 'Remove setup screenshot' }));

    await waitFor(() => expect(screen.getByText('No screenshots yet.')).toBeInTheDocument());
    expect(deleted).toBe(true);
  });

  it('hides the upload form once the trade has three screenshots', async () => {
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json({ screenshots: [shot('a', 'setup'), shot('b', 'entry'), shot('c', 'exit')] })
      )
    );
    renderShots();

    await screen.findByRole('img', { name: 'Exit screenshot' });
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
    expect(screen.getByText('A trade can have at most 3 screenshots.')).toBeInTheDocument();
  });
});
