import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { getTradeContext } from '@/db/contexts';
import { journalEntries, trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { captureContext } from '@/server/marketContext';
import { POST } from '../route';

// `after` only works inside a real Next request. Here it runs the work right
// away, and tests await `afterWork` to see it finish.
const afterWork = vi.hoisted(() => []);
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal()),
  after: (work) => afterWork.push(Promise.resolve().then(work)),
}));

// The market context comes from Alpaca and Cboe; these tests stay offline.
vi.mock('@/server/marketContext', () => ({ captureContext: vi.fn() }));

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

// A scaled entry (two buys) then a flat-to-flat exit in WDGT, plus a
// dividend row the import doesn't understand, all made-up numbers.
const HISTORY = [
  '',
  '',
  'Run Date,Action,Symbol,Description,Type,Price ($),Quantity,Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date',
  '10/09/2026,YOU BOUGHT WIDGET CO COM (WDGT) (Margin),WDGT,WIDGET CO COM,Margin,20,30,"","","","-600.00",500,10/13/2026',
  '10/09/2026,YOU BOUGHT WIDGET CO COM (WDGT) (Margin),WDGT,WIDGET CO COM,Margin,21,10,"","","","-210.00",500,10/13/2026',
  '10/16/2026,YOU SOLD WIDGET CO COM (WDGT) (Margin),WDGT,WIDGET CO COM,Margin,25,"-40","",0.05,"",999.95,500,10/19/2026',
  '10/15/2026,DIVIDEND RECEIVED WIDGET CO COM (WDGT),WDGT,WIDGET CO COM,Cash,,,,,"",6.00,500,10/15/2026',
  '',
  'Disclaimer text.',
  '',
  'Date downloaded 10/29/2026 11:29 am',
].join('\n');

function post({ text = HISTORY, mode = 'live', confirm = false, file = true } = {}) {
  const body = new FormData();
  if (file) body.append('file', new File([text], 'history.csv', { type: 'text/csv' }));
  body.append('mode', mode);
  if (confirm) body.append('confirm', 'true');
  return POST(new Request('http://localhost/api/imports/fidelity', { method: 'POST', body }));
}

beforeEach(async () => {
  // Let the last test's after() work finish before emptying the tables: its
  // writes can deadlock with the TRUNCATE.
  await Promise.all(afterWork);
  afterWork.length = 0;
  vi.mocked(captureContext).mockReset().mockResolvedValue({ version: 1 });
  await resetDb(getDb());
});
afterAll(() => getDb().$client.end());

describe('POST /api/imports/fidelity', () => {
  it('previews the trade it found without saving anything', async () => {
    const response = await post();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.applied).toBe(false);
    expect(body.trades).toHaveLength(1);
    expect(body.trades[0]).toMatchObject({
      action: 'create',
      symbol: 'WDGT',
      assetClass: 'stock',
      direction: 'long',
      quantity: 40,
      entryPrice: 20.25, // (20 x 30 + 21 x 10) / 40
      openedAt: '2026-10-09T13:30:00.000Z',
      exitPrice: 25,
      closedAt: '2026-10-16T13:30:00.000Z',
      fees: 0.05,
      fillCount: 3,
    });
    expect(body.unreadRows).toEqual([{ description: 'DIVIDEND RECEIVED WIDGET CO COM (WDGT)' }]);
    expect(body.unpaired).toEqual([]);
    expect(await getDb().select().from(trades)).toEqual([]);
  });

  it('saves the trade when confirmed, naming Fidelity in its plan entry', async () => {
    const body = await (await post({ confirm: true })).json();

    expect(body).toMatchObject({ applied: true, created: 1, filled: 0 });
    const saved = await getDb().select().from(trades);
    expect(saved).toHaveLength(1);
    const entries = await getDb().select().from(journalEntries);
    expect(entries).toEqual([expect.objectContaining({ notes: 'Imported from Fidelity.' })]);

    await Promise.all(afterWork);
    expect(captureContext).toHaveBeenCalledTimes(1);
    expect(await getTradeContext(getDb(), saved[0].id)).toEqual({ version: 1 });
  });

  it('skips trades imported before, so overlapping exports are safe', async () => {
    await post({ confirm: true });

    const body = await (await post({ confirm: true })).json();

    expect(body.trades.map((t) => t.action)).toEqual(['skip']);
    expect(body).toMatchObject({ created: 0, filled: 0 });
    expect(await getDb().select().from(trades)).toHaveLength(1);
  });

  it('fills in a plan written that day', async () => {
    const [plan] = await getDb()
      .insert(trades)
      .values({
        mode: 'live',
        symbol: 'WDGT',
        assetClass: 'stock',
        direction: 'long',
        quantity: 40,
        plannedEntry: 20,
        createdAt: new Date('2026-10-09T12:00:00Z'),
      })
      .returning();

    const body = await (await post({ confirm: true })).json();

    expect(body.trades[0]).toMatchObject({ action: 'fill', tradeId: plan.id });
    expect(body).toMatchObject({ created: 0, filled: 1 });
  });

  it('rejects a file that is not a Fidelity account history', async () => {
    const response = await post({ text: 'Symbol,Qty\nWDGT,1' });

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors.file).toEqual([
      'This is not a Fidelity account history: it has no Run Date column.',
    ]);
  });

  it('rejects a missing file and an unknown mode', async () => {
    const response = await post({ file: false, mode: 'imaginary' });

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).fieldErrors).sort()).toEqual(['file', 'mode']);
  });
});
