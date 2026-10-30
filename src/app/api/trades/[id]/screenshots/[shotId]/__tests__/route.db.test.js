import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { addTradeScreenshot, listTradeScreenshots } from '@/db/screenshots';
import { trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { DELETE, GET } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

async function insertTradeWithShot() {
  const [trade] = await getDb()
    .insert(trades)
    .values({ mode: 'paper', symbol: 'SPY', assetClass: 'stock', direction: 'long', quantity: 1 })
    .returning();
  const { screenshot } = await addTradeScreenshot(getDb(), trade.id, {
    label: null,
    contentType: 'image/jpeg',
    bytes: JPEG,
  });
  return { trade, screenshot };
}

const call = (handler, id, shotId, method = 'GET') =>
  handler(new Request(`http://localhost/api/trades/${id}/screenshots/${shotId}`, { method }), {
    params: Promise.resolve({ id, shotId }),
  });

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('GET /api/trades/[id]/screenshots/[shotId]', () => {
  it('serves the image as stored, private and never sniffed as another type', async () => {
    const { trade, screenshot } = await insertTradeWithShot();

    const response = await call(GET, trade.id, screenshot.id);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toMatch(/^private/);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
  });

  it('answers 404 for a screenshot of another trade, or ids that are not uuids', async () => {
    const { screenshot } = await insertTradeWithShot();

    expect((await call(GET, crypto.randomUUID(), screenshot.id)).status).toBe(404);
    expect((await call(GET, 'nope', screenshot.id)).status).toBe(404);
    expect((await call(GET, crypto.randomUUID(), 'nope')).status).toBe(404);
  });
});

describe('DELETE /api/trades/[id]/screenshots/[shotId]', () => {
  it('deletes the screenshot', async () => {
    const { trade, screenshot } = await insertTradeWithShot();

    const response = await call(DELETE, trade.id, screenshot.id, 'DELETE');

    expect(response.status).toBe(204);
    expect(await listTradeScreenshots(getDb(), trade.id)).toEqual([]);
  });

  it('answers 404 when there is no such screenshot', async () => {
    const { trade } = await insertTradeWithShot();

    expect((await call(DELETE, trade.id, crypto.randomUUID(), 'DELETE')).status).toBe(404);
    expect((await call(DELETE, trade.id, 'nope', 'DELETE')).status).toBe(404);
  });
});
