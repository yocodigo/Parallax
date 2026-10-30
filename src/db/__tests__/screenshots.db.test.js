import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { trades } from '../schema';
import {
  addTradeScreenshot,
  deleteTradeScreenshot,
  getTradeScreenshot,
  listTradeScreenshots,
} from '../screenshots';
import { MAX_SCREENSHOTS_PER_TRADE } from '@/lib/screenshot';
import { createTestDb, resetDb } from '../testing';

const db = createTestDb();

const shot = (label = 'entry') => ({
  label,
  contentType: 'image/png',
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
});

async function insertTrade() {
  const [trade] = await db
    .insert(trades)
    .values({ mode: 'paper', symbol: 'SPY', assetClass: 'stock', direction: 'long', quantity: 1 })
    .returning();
  return trade;
}

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

describe('trade screenshots', () => {
  it('adds screenshots and lists them oldest first, without their bytes', async () => {
    const trade = await insertTrade();

    const first = await addTradeScreenshot(db, trade.id, shot('setup'));
    const second = await addTradeScreenshot(db, trade.id, shot(null));

    const list = await listTradeScreenshots(db, trade.id);
    expect(list.map((s) => s.id)).toEqual([first.screenshot.id, second.screenshot.id]);
    expect(list[0]).toEqual({
      id: first.screenshot.id,
      label: 'setup',
      contentType: 'image/png',
      createdAt: expect.any(Date),
    });
    expect(list[1].label).toBeNull();
  });

  it('reads back the image bytes unchanged', async () => {
    const trade = await insertTrade();
    const { screenshot } = await addTradeScreenshot(db, trade.id, shot());

    const image = await getTradeScreenshot(db, trade.id, screenshot.id);

    expect(image.contentType).toBe('image/png');
    expect(new Uint8Array(image.bytes)).toEqual(shot().bytes);
  });

  it('finds a screenshot only under its own trade', async () => {
    const trade = await insertTrade();
    const other = await insertTrade();
    const { screenshot } = await addTradeScreenshot(db, trade.id, shot());

    expect(await getTradeScreenshot(db, other.id, screenshot.id)).toBeNull();
    expect(await deleteTradeScreenshot(db, other.id, screenshot.id)).toBe(false);
  });

  it('refuses one more than the limit per trade', async () => {
    const trade = await insertTrade();
    for (let i = 0; i < MAX_SCREENSHOTS_PER_TRADE; i++) await addTradeScreenshot(db, trade.id, shot());

    expect(await addTradeScreenshot(db, trade.id, shot())).toEqual({ error: 'limit' });
    expect(await listTradeScreenshots(db, trade.id)).toHaveLength(MAX_SCREENSHOTS_PER_TRADE);
  });

  it('refuses a screenshot for a trade that does not exist', async () => {
    expect(await addTradeScreenshot(db, crypto.randomUUID(), shot())).toEqual({ error: 'not_found' });
  });

  it('deletes a screenshot, making room for another', async () => {
    const trade = await insertTrade();
    const { screenshot } = await addTradeScreenshot(db, trade.id, shot());

    expect(await deleteTradeScreenshot(db, trade.id, screenshot.id)).toBe(true);
    expect(await listTradeScreenshots(db, trade.id)).toEqual([]);
  });

  it('deletes the screenshots with their trade', async () => {
    const trade = await insertTrade();
    const { screenshot } = await addTradeScreenshot(db, trade.id, shot());

    await db.delete(trades);

    expect(await getTradeScreenshot(db, trade.id, screenshot.id)).toBeNull();
  });
});
