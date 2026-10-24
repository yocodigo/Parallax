import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { applyImport, listImportCandidates } from '../imports';
import { journalEntries, trades } from '../schema';
import { createTestDb, resetDb } from '../testing';

const db = createTestDb();

const CONTRACT = {
  symbol: 'SPY',
  assetClass: 'option',
  optionType: 'put',
  strike: 761,
  expiration: '2026-10-23',
  multiplier: 100,
  direction: 'long',
};

const facts = {
  quantity: 1,
  entryPrice: 1.3,
  openedAt: new Date('2026-10-23T18:41:05Z'),
  exitPrice: 1.17,
  closedAt: new Date('2026-10-23T18:42:53Z'),
  fees: 1.32,
};

async function insertTrade(values = {}) {
  const [trade] = await db
    .insert(trades)
    .values({ mode: 'live', ...CONTRACT, quantity: 1, plannedEntry: 1.25, ...values })
    .returning();
  return trade;
}

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

describe('listImportCandidates', () => {
  const since = new Date('2026-10-22T18:41:05Z');

  it('returns plans and trades entered since the given time, in the mode, for the symbols', async () => {
    const plan = await insertTrade();
    const entered = await insertTrade({ entryPrice: 1.3, openedAt: new Date('2026-10-23T18:41:00Z') });
    await insertTrade({ mode: 'paper' });
    await insertTrade({ symbol: 'QQQ' });
    await insertTrade({ entryPrice: 1.3, openedAt: new Date('2026-10-01T18:41:00Z') });

    const rows = await listImportCandidates(db, { mode: 'live', symbols: ['SPY'], since });

    expect(rows.map((row) => row.id).sort()).toEqual([plan.id, entered.id].sort());
  });

  it('leaves out plans written before then', async () => {
    const [old] = await db
      .insert(trades)
      .values({ mode: 'live', ...CONTRACT, quantity: 1, plannedEntry: 1.25, createdAt: new Date('2026-10-01T12:00:00Z') })
      .returning();

    const rows = await listImportCandidates(db, { mode: 'live', symbols: ['SPY'], since });

    expect(rows.map((row) => row.id)).not.toContain(old.id);
  });
});

describe('applyImport', () => {
  it('creates new trades, each with a plan entry so it shows in the journal', async () => {
    const { created, filled } = await applyImport(db, [
      { action: 'create', values: { mode: 'live', ...CONTRACT, ...facts } },
    ]);

    expect(filled).toEqual([]);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ mode: 'live', symbol: 'SPY', strike: 761, entryPrice: 1.3, fees: 1.32 });
    const entries = await db.select().from(journalEntries).where(eq(journalEntries.tradeId, created[0].id));
    expect(entries).toEqual([expect.objectContaining({ kind: 'plan', notes: 'Imported from thinkorswim.' })]);
  });

  it("fills in matched trades with the broker's fills, keeping the rest", async () => {
    const plan = await insertTrade({ target: 2 });

    const { filled } = await applyImport(db, [{ action: 'fill', tradeId: plan.id, values: facts }]);

    expect(filled).toEqual([expect.objectContaining({ id: plan.id, ...facts, target: 2, plannedEntry: 1.25 })]);
    expect(await db.select().from(journalEntries)).toEqual([]);
  });

  it('does nothing for skipped trades', async () => {
    const trade = await insertTrade(facts);

    expect(await applyImport(db, [{ action: 'skip', tradeId: trade.id }])).toEqual({ created: [], filled: [] });
  });

  it('changes nothing when any part fails', async () => {
    await expect(
      applyImport(db, [
        { action: 'create', values: { mode: 'live', ...CONTRACT, ...facts } },
        // Closed before it opened: the database refuses it.
        { action: 'create', values: { mode: 'live', ...CONTRACT, ...facts, closedAt: new Date('2026-10-22T00:00:00Z') } },
      ])
    ).rejects.toThrow();

    expect(await db.select().from(trades)).toEqual([]);
  });
});
