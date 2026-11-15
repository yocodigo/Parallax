import { reviewEntry } from './setups/entryReview';
import { fillBarIndex, tradeBias } from './setups/replayTrades';

// An option's entry and stop on the underlying (rules-v3 section 7), from the
// underlying's minute bars around the fill. Returns { entry, derivedStop }:
//
// - `entry`: the VWAP of the 1m bar holding the fill. The fill happened at some
//   moment inside that minute; the minute's VWAP is the fairest single price
//   for it (its close can be most of a minute after the fill). Null when no bar
//   covers the fill.
// - `derivedStop`: { stop, rule } when the 3.1 band-cross setup fired the
//   trade's way on bars that closed before the fill (the entry review's
//   `setup`), its S2 level being the stop. Null otherwise: no other level is
//   ever guessed. Also null when that level was already on the wrong side of
//   the entry (the setup was invalidated by the fill), or there is no entry to
//   check the side against.
export function underlyingAtEntry(trade, bars) {
  const index = fillBarIndex(bars, trade.openedAt);
  const entry = index === null ? null : (bars[index].vw ?? null);
  return { entry, derivedStop: entry === null ? null : derivedStop(trade, bars, entry) };
}

function derivedStop(trade, bars, entry) {
  // The review resamples as of the fill, so the bar holding it is left out.
  const setup = reviewEntry(trade, bars)?.setup;
  if (!setup) return null;
  const stop = setup.idealStop;
  const losingSide = tradeBias(trade) === 'long' ? stop < entry : stop > entry;
  return losingSide ? { stop, rule: 'band_cross_s2' } : null;
}
