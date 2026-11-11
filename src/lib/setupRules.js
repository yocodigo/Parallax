import { LOCKOUTS, SIZE_MAX, SIZE_MIN } from './setups/settings';

// The trader's setups and rules, in brief, for the Performance Review's coach
// to judge trades against. A paraphrase of the setup definitions kept out of
// the repository (docs/private/setups.md), so it holds on a deploy that has no
// copy of that file; the numbers that are settings are read from settings.js.

const lockouts = LOCKOUTS.map(([from, to]) => `${from}-${to}`).join(', ');

export const SETUP_RULES = `Setup 3.1, 15m band cross with fib extension targets (the main 0DTE process):
- The bias comes from a 15m candle closing beyond its middle Bollinger band: above is long, below is short.
- The entry is the next 5m candle in that direction that overlaps the one before it only a little. Rising volume makes it stronger but isn't required.
- Two extras grade an entry without being required: room on the 1m chart to reach the outer band, and a four-touch line (3.2) in the trade's direction.
- Targets come from the fib extension(s) the trader records each morning. Target 1 is the 50% level and target 2 the 100% level; with two fibs, the lower-timeframe one comes first, and the higher-timeframe 50% is next if price turns against it.
- At target 1, read the 1m reaction: rejected means close the position; oscillating means close one contract in profit when holding two, unless the oscillation drifts the trade's way; ripped through means hold toward target 2.

Setup 3.2, four-touch break (4xBO above resistance, 4xBD below support): a trendline through swing points that price has touched three times; the fourth approach is the one to trade. A close through the line is the break. It is valid when the breaking candle's body is about four times the recent average and price accepts beyond the line; it is a trap when the break is reclaimed. Grade A needs compression into the line and fairly even gaps between touches.

Setup 3.3, reversal sequence: price sweeps a pool of equal highs or lows, a displacement candle quickly closes back across it, structure breaks the other way, and the entry is a limit order at the midpoint of the fair value gap the displacement left.

Setup 3.4, three-gate entry at a level: price sweeps into the level, a candle rejects it by closing back inside, and within three bars price trades beyond the rejection candle. The stop goes beyond the sweep. No entries in the middle of a range.

Stops are chosen and written down before entry and move only on structure:
- S1: a 5m candle closes back across the 5m middle band (slowest, widest).
- S2: a 1m candle closes beyond the entry candle's far extreme (faster, still structural).
- S3: a planned time stop, because target 1 wasn't reached within 15 minutes of entry.
- Backstop on every trade: a cap on the dollar loss per contract.

Exits: planned exits are an invalidation (the stop rule hit), a target, a rejection at the 50%, a planned partial, a structural trail, and a planned time exit. Discomfort exits are a sweep scare, an adverse candle, the P/L moving, time in the trade, and feeling heavy; they are the exits the rules are meant to prevent.

Pre-entry gates:
- Window: no entries in the lockout windows, New York time ${lockouts}.
- Size: ${SIZE_MIN}-${SIZE_MAX} contracts.
- Direction: the 15m has closed beyond the middle band the trade's way.
- Entry: the 5m entry candle's overlap is within its limit.
- Location: not in the middle of the range.
- Stop: a stop rule chosen before entry.
- Target: the day's fib levels are recorded.
- State: calm and rested, not bored, anxious, or revenge trading.`;
