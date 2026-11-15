// The minute bars of a trade's window, split by how much of them the trade
// was really in. The bar holding the fill also holds prices from before it,
// and the bar holding the exit prices from after it, so for a short trade the
// window is mostly those two edge minutes and its extremes can be ones the
// position never saw.

const MINUTE = 60_000;

// A trade held under this many minutes is flagged `edgeMinutesOnly`.
export const EDGE_MINUTES_HOLD = 2;

const minuteOf = (date) => Math.floor(date.getTime() / MINUTE) * MINUTE;

// `bars` are the window's minute bars (Alpaca keys, oldest first). Returns
// { edgeMinutesOnly, between }: whether the trade was held under
// EDGE_MINUTES_HOLD minutes, and the bars strictly between the fill minute and
// the exit minute (to the last bar while the trade is open).
export function edgeSplit(bars, openedAt, closedAt) {
  const fillMinute = minuteOf(openedAt);
  const exitMinute = closedAt ? minuteOf(closedAt) : Infinity;
  return {
    edgeMinutesOnly: closedAt !== null && closedAt - openedAt < EDGE_MINUTES_HOLD * MINUTE,
    between: bars.filter((bar) => {
      const start = Date.parse(bar.t);
      return start > fillMinute && start < exitMinute;
    }),
  };
}
