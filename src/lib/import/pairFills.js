// Turns broker fills into trades: one per stretch from flat back to flat, per
// contract. Fills are { ref, executedAt, side, quantity, price, fees } plus
// the instrument (symbol, assetClass, optionType, strike, expiration,
// multiplier), as parseThinkorswimStatement returns them.
//
// Only long trades: a sale while flat is taken as closing a position bought
// before the statement, never as opening a short. A cash account can't sell
// an option it doesn't own.

const INSTRUMENT = ['symbol', 'assetClass', 'optionType', 'strike', 'expiration', 'multiplier'];

const instrumentKey = (fill) => INSTRUMENT.map((field) => fill[field] ?? '').join('|');
const cents = (value) => Math.round(value * 100) / 100;
// Prices to the hundredth of a cent, so averaging leaves no float noise.
const price = (value) => Math.round(value * 10000) / 10000;

const sumOf = (fills, pick) => fills.reduce((sum, f) => sum + pick(f), 0);
const averagePrice = (fills) => price(sumOf(fills, (f) => f.price * f.quantity) / sumOf(fills, (f) => f.quantity));

// The app keeps one entry and one exit per trade, so a trade scaled into or
// out of gets the quantity-weighted average price; `fillCount` says so.
function toTrade(fills) {
  const buys = fills.filter((f) => f.side === 'buy');
  const sells = fills.filter((f) => f.side === 'sell');
  const first = fills[0];
  return {
    ...Object.fromEntries(INSTRUMENT.map((field) => [field, first[field]])),
    direction: 'long',
    quantity: sumOf(buys, (f) => f.quantity),
    entryPrice: averagePrice(buys),
    openedAt: first.executedAt,
    exitPrice: sells.length ? averagePrice(sells) : null,
    closedAt: sells.length ? sells.at(-1).executedAt : null,
    fees: cents(sumOf(fills, (f) => f.fees)),
    refs: fills.map((f) => f.ref),
    fillCount: fills.length,
  };
}

// Returns { trades, unpaired }: the trades, by when they were opened, and
// the fills that don't make a whole trade, each group with the reason.
export function pairFills(fills) {
  const byInstrument = new Map();
  const ordered = [...fills].sort((a, b) => a.executedAt - b.executedAt);
  for (const fill of ordered) {
    const key = instrumentKey(fill);
    if (!byInstrument.has(key)) byInstrument.set(key, []);
    byInstrument.get(key).push(fill);
  }

  const trades = [];
  const unpaired = [];
  for (const instrumentFills of byInstrument.values()) {
    let current = [];
    let position = 0;
    for (const fill of instrumentFills) {
      if (fill.side === 'sell' && position === 0) {
        unpaired.push({ fills: [fill], reason: 'Closes a position opened before this statement' });
        continue;
      }
      current.push(fill);
      position += fill.side === 'buy' ? fill.quantity : -fill.quantity;
      if (position < 0) {
        unpaired.push({ fills: current, reason: 'Sells more than was bought in this statement' });
      } else if (position === 0) {
        trades.push(toTrade(current));
      } else {
        continue;
      }
      current = [];
      position = 0;
    }

    if (current.length === 0) continue;
    if (current.some((f) => f.side === 'sell')) {
      unpaired.push({ fills: current, reason: 'Partly closed by the end of this statement' });
    } else {
      trades.push(toTrade(current));
    }
  }

  trades.sort((a, b) => a.openedAt - b.openedAt);
  return { trades, unpaired };
}
