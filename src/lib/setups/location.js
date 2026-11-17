// [rules-v3 4] Location OK, redefined: an entry counts as located when it is
// close to a tier 1 or 2 level that the day had already broken with
// acceptance, or swept and rejected, the trade's way (setups.md 2.8). Any other
// entry is floating. Tier 3 levels are targets, so they never locate one.
// Pure: `levels` come from levelMap, `bars` are the underlying's minute bars,
// read on the 1m closes the invalidation rule watches.

import { atLeast, atMost } from './compare';
import { MET, MISSED, UNKNOWN } from './gates';
import { atr } from './relative';
import { resample } from './resample';
import { nyDay, sessionBars, sessionOf } from './session';
import { LEVEL_NEAR, N_ACC, N_RECLAIM } from './settings';

// A level's price at bar `k`: a four-touch line moves by its slope per minute
// bar from its price at the last bar (counted in bars, as levelMap prices
// it); every other level stays put.
const valueAt = (bars, level, k) => level.price + (level.slope ?? 0) * (k - (bars.length - 1));

const closesAbove = (bars, level, k) => !atMost(bars[k].c, valueAt(bars, level, k));
const closesBelow = (bars, level, k) => !atLeast(bars[k].c, valueAt(bars, level, k));

// Bar `k` traded through the level and closed back on the side the bar
// before closed on: a sweep of a level below (support, for a long) or above
// (resistance, for a short). A bar that crosses from one side and closes on
// the other is a break, not a sweep. A close on the level itself counts as
// back on either side, so such a bar sweeps toward whichever side the bar
// before closed on, and says nothing when that bar closed on the level too.
function sweepAt(bars, level, k) {
  if (k < 1) return null;
  const value = valueAt(bars, level, k);
  const below = !atLeast(bars[k].l, value) && atLeast(bars[k].c, value) && !closesBelow(bars, level, k - 1);
  const above = !atMost(bars[k].h, value) && atMost(bars[k].c, value) && !closesAbove(bars, level, k - 1);
  if (below === above) return null;
  return below ? 'long' : 'short';
}

// Bar `k` is the first close beyond the level, and the N_ACC closes after it
// stayed beyond with no close back inside within N_RECLAIM bars so far.
// Returns the bias it favours, or null. Needs every acceptance bar closed.
function acceptedFrom(bars, level, k) {
  if (k < 1 || k + N_ACC > bars.length - 1) return null;
  for (const [bias, beyond] of [
    ['long', closesAbove],
    ['short', closesBelow],
  ]) {
    if (!beyond(bars, level, k) || beyond(bars, level, k - 1)) continue;
    const last = Math.min(k + Math.max(N_ACC, N_RECLAIM), bars.length - 1);
    let held = true;
    for (let j = k + 1; j <= last; j++) if (!beyond(bars, level, j)) held = false;
    return held ? bias : null;
  }
  return null;
}

// The latest event at `level` among bars `from` to the last: { type, bias,
// index (the bar it completed on), barIndex (the break or sweep bar) }, or
// null. Only the latest counts: a level broken up and later back down speaks
// for the short side.
function latestEvent(bars, level, from) {
  let latest = null;
  for (let k = from; k < bars.length; k++) {
    const swept = sweepAt(bars, level, k);
    if (swept && (!latest || k >= latest.index)) latest = { type: 'swept', bias: swept, index: k, barIndex: k };
    const accepted = acceptedFrom(bars, level, k);
    if (accepted && (!latest || k + N_ACC >= latest.index)) {
      latest = { type: 'accepted', bias: accepted, index: k + N_ACC, barIndex: k };
    }
  }
  return latest;
}

// [2.2] Rising volume on the break or sweep bar: the independent confirmation
// a tier 2 level needs. A second price signal would be the same vote again.
const risingVolume = (bars, k) => k > 0 && bars[k].v > bars[k - 1].v;

// Location OK for an entry as of `asOf` (a Date) on the trade's `bias` (the
// side it bets on the underlying). Returns { status, level, event, at }: met
// with the nearest qualifying level ({ kind, price, tier }), its event
// ('accepted' or 'swept'), and the start time of the bar that completed it
// (the sweep bar, or the last acceptance close); missed (floating)
// with nulls; unknown without a direction, a closed bar of the day, or the
// history for a 1m ATR.
export function levelLocation({ levels, bars, asOf, bias }) {
  const none = (status) => ({ status, level: null, event: null, at: null });
  if (bias !== 'long' && bias !== 'short') return none(UNKNOWN);
  const closed = resample(sessionBars(bars), 1, { asOf });
  const today = sessionOf(closed, nyDay(asOf));
  const range = closed.length ? atr(closed, closed.length - 1) : null;
  if (today.length === 0 || range === null) return none(UNKNOWN);
  const price = today.at(-1).c;
  const dayStart = closed.length - today.length;

  const located = levels
    .filter((level) => level.tier <= 2 && atMost(Math.abs(level.price - price), LEVEL_NEAR * range))
    .map((level) => {
      // Only the day's bars after the level formed can break or sweep it.
      const formed = level.formedAt ? Date.parse(level.formedAt) : -Infinity;
      const from = closed.findIndex((bar, k) => k >= dayStart && Date.parse(bar.t) >= formed);
      return { level, event: from < 0 ? null : latestEvent(closed, level, from) };
    })
    .filter(({ level, event }) => event?.bias === bias && (level.tier === 1 || risingVolume(closed, event.barIndex)))
    .sort((a, b) => Math.abs(a.level.price - price) - Math.abs(b.level.price - price));

  if (located.length === 0) return none(MISSED);
  const { level, event } = located[0];
  return {
    status: MET,
    level: { kind: level.kind, price: level.price, tier: level.tier },
    event: event.type,
    at: closed[event.index].t,
  };
}
