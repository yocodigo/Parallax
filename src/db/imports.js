import { and, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { journalEntries, trades } from './schema';

// What an import could match: trades in `mode` for `symbols` that were
// entered since `since`, or are plans written since then.
export async function listImportCandidates(db, { mode, symbols, since }) {
  if (symbols.length === 0) return [];
  return db
    .select()
    .from(trades)
    .where(
      and(
        eq(trades.mode, mode),
        inArray(trades.symbol, symbols),
        or(gte(trades.openedAt, since), and(isNull(trades.openedAt), gte(trades.createdAt, since)))
      )
    );
}

// Carries out matchImport's actions in one transaction, so a failed import
// changes nothing. A created trade gets a plan entry, since the journal lists
// trades through their entries. Returns { created, filled }, the trades as
// saved.
export async function applyImport(db, actions) {
  return db.transaction(async (tx) => {
    const created = [];
    const filled = [];
    for (const { action, tradeId, values } of actions) {
      if (action === 'create') {
        const [trade] = await tx.insert(trades).values(values).returning();
        await tx
          .insert(journalEntries)
          .values({ kind: 'plan', tradeId: trade.id, notes: 'Imported from thinkorswim.' });
        created.push(trade);
      } else if (action === 'fill') {
        const [trade] = await tx.update(trades).set(values).where(eq(trades.id, tradeId)).returning();
        filled.push(trade);
      }
    }
    return { created, filled };
  });
}
