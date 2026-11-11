import { LOCKOUTS, SIZE_MAX, SIZE_MIN, TIME_STOP } from './setups/settings';

// The trader's setups and rules, in brief, for the Performance Review's coach
// to judge trades against. A paraphrase of the setup definitions kept out of
// the repository (docs/private/setups.md), so it holds on a deploy that has no
// copy of that file; the numbers that are settings are read from settings.js.

const lockouts = LOCKOUTS.map(([from, to]) => `${from}-${to}`).join(', ');

export const SETUP_RULES = `Setup 3.1, the 15m band cross with fib extension targets, the trader's primary same-day options routine:
- The bias comes from a 15m candle closing beyond its middle Bollinger band: above is long, below is short.
- The entry is the first 5m candle after that cross to run the same way while overlapping the candle before it only slightly. Rising volume makes it stronger but isn't required.
- Two extras grade an entry without being required: room on the 1m chart to reach the outer band, and a four-touch line (3.2) in the trade's direction.
- Targets come from the fib extension(s) the trader records each morning. Target 1 is the 50% level and target 2 the 100% level; with two fibs, the lower-timeframe one comes first, and the higher-timeframe 50% is next if price turns against it.
- At target 1, read the 1m reaction: rejected means close the position; oscillating means close one contract in profit when holding two, unless the oscillation drifts the trade's way; ripped through means hold toward target 2.

Setup 3.2, four-touch break (4xBO above resistance, 4xBD below support): a trendline through swing points that price has touched three times; the fourth approach is the one to trade. A close through the line is the break. It is valid when the breaking candle's body is about four times the recent average and price accepts beyond the line; it is a trap when the break is reclaimed. Grade A needs compression into the line (rising lows into a breakout, falling highs into a breakdown) and good spacing: either fairly even gaps between the touches, or two touches bunched together with one gap far shorter than the rest. A break that is reclaimed becomes a trade the other way, entered on the reclaim.

Setup 3.3, reversal sequence: price sweeps a pool of equal highs or lows, a displacement candle quickly closes back across it, structure breaks the other way, and the entry is a limit order at the midpoint of the fair value gap the displacement left, with the stop just beyond the sweep and the first target at the edge of the nearest opposite pool.

Setup 3.4, three-gate entry at a level: price sweeps into the level, a candle rejects it by closing back inside, and within three bars price trades beyond the rejection candle. The stop goes beyond the sweep. No entries in the middle of a range.

Stops are chosen and written down before entry and move only on structure:
- S1: the 5m chart closes back over its middle band, the slowest and widest of the three.
- S2: a 1m close past the far end of the entry candle, quicker but still tied to structure.
- S3: a planned time stop, used when target 1 hasn't been reached ${TIME_STOP} minutes after entry.
- Backstop on every trade: a cap on the dollar loss per contract.

Exits: planned exits are an invalidation (the stop rule hit), a target, a rejection at the 50%, a planned partial, a structural trail, and a planned time exit. Discomfort exits are a sweep scare, an adverse candle, the P/L moving, time in the trade, and feeling heavy; they are the exits the rules are meant to prevent.

Pre-entry gates:
- Window: no entries in the lockout windows, New York time ${lockouts}.
- Size: ${SIZE_MIN}-${SIZE_MAX} contracts.
- Direction: the 15m has closed beyond the middle band the trade's way.
- Entry: the 5m entry candle's overlap is within its limit.
- Location: not in the middle of the range.
- Stop: one of the stop rules picked before the entry, not after.
- Target: the day's fib levels are recorded.
- State: the trader is calm and rested, and not bored, anxious, or chasing back a loss.`;
