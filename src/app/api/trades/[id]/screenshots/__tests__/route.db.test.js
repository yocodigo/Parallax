import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { addTradeScreenshot } from '@/db/screenshots';
import { trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { MAX_SCREENSHOTS_PER_TRADE } from '@/lib/screenshot';
import { GET, POST } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

async function insertTrade() {
  const [trade] = await getDb()
    .insert(trades)
    .values({ mode: 'paper', symbol: 'SPY', assetClass: 'stock', direction: 'long', quantity: 1 })
    .returning();
  return trade;
}

const url = (id) => `http://localhost/api/trades/${id}/screenshots`;
const context = (id) => ({ params: Promise.resolve({ id }) });

const get = (id) => GET(new Request(url(id)), context(id));

function post(id, { bytes = PNG, label } = {}) {
  const body = new FormData();
  if (bytes) body.append('image', new File([bytes], 'chart.png', { type: 'image/png' }));
  if (label) body.append('label', label);
  return POST(new Request(url(id), { method: 'POST', body }), context(id));
}

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('POST /api/trades/[id]/screenshots', () => {
  it('saves the image and returns it without its bytes', async () => {
    const trade = await insertTrade();

    const response = await post(trade.id, { label: 'exit' });

    expect(response.status).toBe(201);
    const { screenshot } = await response.json();
    expect(screenshot).toEqual({
      id: expect.any(String),
      label: 'exit',
      contentType: 'image/png',
      createdAt: expect.any(String),
    });
  });

  it('answers 400 with field errors for a file that is not an image', async () => {
    const trade = await insertTrade();

    const response = await post(trade.id, { bytes: new TextEncoder().encode('<html>') });

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors.image).toBeDefined();
  });

  it('answers 400 when the body is not a form', async () => {
    const trade = await insertTrade();
    const request = new Request(url(trade.id), { method: 'POST', body: '{}' });

    expect((await POST(request, context(trade.id))).status).toBe(400);
  });

  it('answers 409 once the trade has the most screenshots allowed', async () => {
    const trade = await insertTrade();
    for (let i = 0; i < MAX_SCREENSHOTS_PER_TRADE; i++) await post(trade.id);

    const response = await post(trade.id);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      `A trade can have at most ${MAX_SCREENSHOTS_PER_TRADE} screenshots`
    );
  });

  it('answers 404 for a trade that does not exist, or an id that is not a trade id', async () => {
    expect((await post(crypto.randomUUID())).status).toBe(404);
    expect((await post('nope')).status).toBe(404);
  });
});

describe('GET /api/trades/[id]/screenshots', () => {
  it("lists the trade's screenshots", async () => {
    const trade = await insertTrade();
    const { screenshot } = await addTradeScreenshot(getDb(), trade.id, {
      label: 'setup',
      contentType: 'image/png',
      bytes: PNG,
    });

    const response = await get(trade.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      screenshots: [{ id: screenshot.id, label: 'setup', contentType: 'image/png', createdAt: expect.any(String) }],
    });
  });

  it('answers 404 for an id that is not a trade id', async () => {
    expect((await get('nope')).status).toBe(404);
  });
});
