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

// Two round trips in the SPY 761 put on Oct 23, 2026, times in Pacific.
const STATEMENT = [
  'Account Statement for 00000000SCHW (Cash) since 10/22/26 through 10/22/26',
  '',
  'Cash Balance',
  'DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE',
  '10/23/26,11:41:05,TRD,="1000000000001",BOT +1 SPY 100 (Weeklys) 23 OCT 26 761 PUT @1.30,-0.01,-0.65,-130.00,370.00',
  '10/23/26,11:42:53,TRD,="1000000000002",SOLD -1 SPY 100 (Weeklys) 23 OCT 26 761 PUT @1.17,-0.01,-0.65,117.00,485.68',
  '10/23/26,12:22:46,TRD,="1000000000003",BOT +1 SPY 100 (Weeklys) 23 OCT 26 761 PUT @.94 CBOE,-0.01,-0.65,-94.00,390.36',
  '10/23/26,12:23:48,TRD,="1000000000004",SOLD -1 SPY 100 (Weeklys) 23 OCT 26 761 PUT @.98 CBOE,-0.01,-0.65,98.00,487.04',
  '10/23/26,12:30:00,TRD,="1000000000005",BOT +10 AAPL @250.00,,0.00,-2500.00,0.00',
  '',
].join('\n');

function post({ text = STATEMENT, timeZone = 'America/Los_Angeles', mode = 'live', confirm = false, file = true } = {}) {
  const body = new FormData();
  if (file) body.append('file', new File([text], 'statement.csv', { type: 'text/csv' }));
  body.append('timeZone', timeZone);
  body.append('mode', mode);
  if (confirm) body.append('confirm', 'true');
  return POST(new Request('http://localhost/api/imports/thinkorswim', { method: 'POST', body }));
}

beforeEach(async () => {
  afterWork.length = 0;
  vi.mocked(captureContext).mockReset().mockResolvedValue({ version: 1 });
  await resetDb(getDb());
});
afterAll(() => getDb().$client.end());

describe('POST /api/imports/thinkorswim', () => {
  it('previews the trades it found without saving anything', async () => {
    const response = await post();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.applied).toBe(false);
    expect(body.trades).toHaveLength(2);
    expect(body.trades[0]).toMatchObject({
      action: 'create',
      symbol: 'SPY',
      optionType: 'put',
      strike: 761,
      expiration: '2026-10-23',
      direction: 'long',
      quantity: 1,
      entryPrice: 1.3,
      openedAt: '2026-10-23T18:41:05.000Z',
      exitPrice: 1.17,
      closedAt: '2026-10-23T18:42:53.000Z',
      fees: 1.32,
      fillCount: 2,
    });
    // (1.17 - 1.30) x 100 - 1.32 in fees.
    expect(body.trades[0].profitLoss).toBeCloseTo(-14.32);
    expect(body.unreadRows).toEqual([{ ref: '1000000000005', description: 'BOT +10 AAPL @250.00' }]);
    expect(body.unpaired).toEqual([]);
    expect(await getDb().select().from(trades)).toEqual([]);
  });

  it('saves the trades when confirmed and captures their context afterwards', async () => {
    const body = await (await post({ confirm: true })).json();

    expect(body).toMatchObject({ applied: true, created: 2, filled: 0 });
    const saved = await getDb().select().from(trades);
    expect(saved.map((t) => [t.mode, t.entryPrice, t.exitPrice, t.multiplier]).sort()).toEqual([
      ['live', 0.94, 0.98, 100],
      ['live', 1.3, 1.17, 100],
    ]);
    expect(await getDb().select().from(journalEntries)).toHaveLength(2);

    await Promise.all(afterWork);
    expect(captureContext).toHaveBeenCalledTimes(2);
    expect(await getTradeContext(getDb(), saved[0].id)).toEqual({ version: 1 });
  });

  it('skips trades imported before, so overlapping statements are safe', async () => {
    await post({ confirm: true });

    const body = await (await post({ confirm: true })).json();

    expect(body.trades.map((t) => t.action)).toEqual(['skip', 'skip']);
    expect(body).toMatchObject({ created: 0, filled: 0 });
    expect(await getDb().select().from(trades)).toHaveLength(2);
  });

  it('fills in a plan written that morning', async () => {
    const [plan] = await getDb()
      .insert(trades)
      .values({
        mode: 'live',
        symbol: 'SPY',
        assetClass: 'option',
        optionType: 'put',
        strike: 761,
        expiration: '2026-10-23',
        multiplier: 100,
        direction: 'long',
        quantity: 2,
        plannedEntry: 1.25,
        createdAt: new Date('2026-10-23T16:00:00Z'),
      })
      .returning();

    const body = await (await post({ confirm: true })).json();

    expect(body.trades[0]).toMatchObject({ action: 'fill', tradeId: plan.id });
    expect(body).toMatchObject({ created: 1, filled: 1 });
  });

  it('rejects a file that is not an account statement', async () => {
    const response = await post({ text: 'Symbol,Qty\nSPY,1' });

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors.file).toEqual([
      'This is not a thinkorswim account statement: it has no Cash Balance section.',
    ]);
  });

  it('rejects a missing file, an unknown time zone, and an unknown mode', async () => {
    const response = await post({ file: false, timeZone: 'Mars/Olympus', mode: 'imaginary' });

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).fieldErrors).sort()).toEqual(['file', 'mode', 'timeZone']);
  });
});
