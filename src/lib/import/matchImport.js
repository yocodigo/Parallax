// Decides what an import does with each trade pairFills found, against the
// trades already in the journal:
//
// - skip: a trade in the journal was entered at the very same second, so it
//   was imported before.
// - fill: a hand-recorded entry within 5 minutes, or else a plan with no
//   entry written earlier the same New York day, gets the broker's fills.
//   Its stop, target, strategy, and notes stay.
// - create: nothing matches, so it becomes a new trade.
//
// Only trades of the same mode, contract, and direction match, and each
// matches once, the earliest imported trade first.

const NEAR_MS = 5 * 60 * 1000;

const SAME = ['symbol', 'assetClass', 'optionType', 'strike', 'expiration', 'direction'];
const FILL_FIELDS = ['quantity', 'entryPrice', 'openedAt', 'exitPrice', 'closedAt', 'fees'];
const COLUMNS = [...SAME, 'multiplier', ...FILL_FIELDS];

const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const pick = (trade, fields) => Object.fromEntries(fields.map((field) => [field, trade[field]]));
const sameInstrument = (a, b) => SAME.every((field) => (a[field] ?? null) === (b[field] ?? null));

// `existing` are trades in the journal with id, mode, createdAt, and the
// trade fields. Returns one action per imported trade, in order:
// { action, imported, tradeId?, values? }, where `values` are the columns
// to insert (create) or update (fill).
export function matchImport(importedTrades, existing, { mode }) {
  const candidates = existing.filter((trade) => trade.mode === mode);
  const used = new Set();
  const take = (match) => {
    used.add(match.id);
    return match.id;
  };

  return importedTrades.map((imported) => {
    const open = imported.openedAt.getTime();
    const available = candidates.filter((t) => !used.has(t.id) && sameInstrument(t, imported));

    const same = available.find((t) => t.openedAt?.getTime() === open);
    if (same) return { action: 'skip', imported, tradeId: take(same) };

    const values = pick(imported, FILL_FIELDS);
    const entered = available
      .filter((t) => t.openedAt && Math.abs(t.openedAt.getTime() - open) <= NEAR_MS)
      .sort((a, b) => Math.abs(a.openedAt - open) - Math.abs(b.openedAt - open))[0];
    if (entered) return { action: 'fill', imported, tradeId: take(entered), values };

    const plan = available
      .filter(
        (t) =>
          !t.openedAt &&
          t.createdAt.getTime() <= open &&
          nyDate.format(t.createdAt) === nyDate.format(imported.openedAt)
      )
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (plan) return { action: 'fill', imported, tradeId: take(plan), values };

    return { action: 'create', imported, values: { ...pick(imported, COLUMNS), mode } };
  });
}
