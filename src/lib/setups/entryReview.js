// [10] A recorded trade's entry review, assembled from the underlying's
// minute bars. Pure: the caller fetches the bars (session bars, oldest first,
// Alpaca's keys, reaching back far enough for the 15m bands). It judges the
// entry by what had closed before the fill and nothing after (section 1), the
// way tradeGates does, and shares its helpers for the 15m cross and the
// session's own bars.
//
// Unlike the gates, which ask whether a rule held, this reports the
// measurements the coach reads: where the setup's ideal entry and stop sat,
// how far the fill chased it, and what the bars around the entry looked like.
// A measurement the bars can't give is null.

import { overlap } from './candles';
import { isPressureDate, seasonalDate } from './calendarDates';
import { bandCross } from './direction';
import { findEntry, risingVolume } from './entry';
import { fourTouchBreaks } from './fourTouch';
import { inWindow } from './gates';
import { tradeBias } from './replayTrades';
import { resample } from './resample';
import { roomToBand } from './room';
import { sessionBars, tradingDay } from './session';
import { dealingRange, isMidRange, swings } from './swings';
import { crossIndex, sessionOf } from './tradeGates';

// The 3.1 setup the trade could have been taken on: the first 5m entry candle
// after the newest 15m cross, when the cross points the way the trade bet.
// The ideal entry is that candle's close and the ideal stop its far extreme
// (S2, section 5), both on the underlying. Null when no entry candle had
// closed by the fill, or the cross was the other way.
function bandCrossSetup(bars15, bars5, crossAt, bias) {
  if (crossAt === null) return null;
  const found = findEntry(bars15, bars5, crossAt);
  if (!found || found.bias !== bias) return null;
  const candle = bars5[found.index];
  return {
    name: 'band_cross',
    crossAt: bars15[crossAt].t,
    entryAt: candle.t,
    idealEntry: candle.c,
    idealStop: bias === 'long' ? candle.l : candle.h,
    risingVolume: found.risingVolume,
  };
}

// How far the fill sits beyond the ideal entry, in units of the distance from
// that entry to the ideal stop: 0 at the ideal entry, positive when the fill
// chased the move, negative when it got a better price.
function chaseInR(setup, price, bias) {
  if (!setup || price === null) return null;
  const risk = Math.abs(setup.idealEntry - setup.idealStop);
  if (risk === 0) return null;
  return (bias === 'long' ? price - setup.idealEntry : setup.idealEntry - price) / risk;
}

// The last closed 5m bar against the one before it, the bar the Entry OK gate
// judges: its overlap with that bar and its volume against that bar's.
function entryCandleOf(bars5) {
  const i = bars5.length - 1;
  if (i < 1) return null;
  const prev = bars5[i - 1];
  return {
    overlap: overlap(bars5[i], prev),
    volumeVsPrevious: prev.v > 0 ? bars5[i].v / prev.v : null,
    risingVolume: risingVolume(bars5, i),
  };
}

// The side a four-touch break offers a trade on: an unbroken 4xBO is long and
// a 4xBD short, but a trap offers the trade the other way (`trade.side`).
const sideOf = (found) => found.trade?.side ?? (found.kind === '4xBO' ? 'long' : 'short');

// A four-touch break on `candles` that the trade would have been taken in the
// direction of. The latest one, as of the last bar.
function latestFourTouch(candles, timeframe, bias) {
  if (candles.length === 0) return null;
  const found = fourTouchBreaks(candles, candles.length - 1)
    .filter((b) => sideOf(b) === bias)
    .at(-1);
  if (!found) return null;
  return {
    timeframe,
    kind: found.kind,
    status: found.status,
    grade: found.grade,
    brokeAt: candles[found.breakIndex].t,
  };
}

// Whichever of the 1m and 5m lines broke later; the 1m one on a tie.
function fourTouchOf(bars1, bars5, bias) {
  const onMinute = latestFourTouch(bars1, '1m', bias);
  const onFive = latestFourTouch(bars5, '5m', bias);
  if (!onMinute || !onFive) return onMinute ?? onFive;
  return onFive.brokeAt > onMinute.brokeAt ? onFive : onMinute;
}

// The latest four-touch break in `trade`'s direction on the entry day's 1m
// and 5m bars that closed before the fill, from `bars` (the underlying's
// minute bars), or null when there is none. `trade` must have an `openedAt`.
// It keeps the regular session itself, since the context snapshot's bars
// include extended hours.
export function fourTouchAt(trade, bars) {
  const asOf = trade.openedAt;
  const day = tradingDay({ t: asOf.toISOString() });
  const regular = sessionBars(bars);
  const bars1 = sessionOf(resample(regular, 1, { asOf }), day);
  const bars5 = sessionOf(resample(regular, 5, { asOf }), day);
  return fourTouchOf(bars1, bars5, tradeBias(trade));
}

// The review of `trade` (a trades row) from `bars`, the underlying's minute
// bars around the entry. Returns null for a plan that was never entered;
// otherwise { bias, setup, chaseR, entryCandle, room, fourTouch, inLockout,
// midRange, pressureDate, seasonalDate }.
export function reviewEntry(trade, bars = []) {
  if (!trade.openedAt) return null;
  const asOf = trade.openedAt;
  const day = tradingDay({ t: asOf.toISOString() });
  const bias = tradeBias(trade);

  const bars1 = resample(bars, 1, { asOf });
  const bars15 = resample(bars, 15, { asOf });
  const bars5 = sessionOf(resample(bars, 5, { asOf }), day);
  // The underlying's price at the fill: the close of the last minute that
  // ended before it, as in tradeGates (an option's own entry price is a
  // premium).
  const last = bars1.at(-1);
  const price = last && tradingDay(last) === day ? last.c : null;

  const setup = bandCrossSetup(bars15, bars5, crossIndex(bars15, day), bias);
  const i5 = bars5.length - 1;
  const range = i5 < 0 ? null : dealingRange(swings(bars5, i5));

  return {
    bias,
    setup,
    chaseR: chaseInR(setup, price, bias),
    entryCandle: entryCandleOf(bars5),
    room: price === null ? null : roomToBand(bars1, bars1.length - 1, bias, price),
    // Resamples on its own, since the context snapshot calls it alone.
    fourTouch: fourTouchAt(trade, bars),
    inLockout: inWindow(asOf),
    midRange: price !== null && range ? isMidRange(price, range) : null,
    pressureDate: isPressureDate(day),
    seasonalDate: seasonalDate(day),
  };
}
