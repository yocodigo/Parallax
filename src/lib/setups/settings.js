// Named defaults for the setup detectors, as defined in docs/private/setups.md
// (section numbers in brackets). Tune them against outcomes, not by feel.

// [2.4] "Little to no overlap": at most this share of a bar's range was also
// covered by the previous bar.
export const OVERLAP_MAX = 0.25;

// [1] Relative measures compare a bar with this many bars before it.
export const RELATIVE_LOOKBACK = 20;

// [1] Bars in the average true range.
export const ATR_PERIOD = 14;

// [2.2] Volume against the average: each class starts at its limit.
export const VOLUME_LIMITS = { low: 0.5, average: 0.7, high: 1.3, abnormallyHigh: 2.0 };

// [2.2] Range (spread) against the average range: each class starts at its limit.
export const SPREAD_LIMITS = { average: 0.7, large: 1.3, abnormallyLarge: 2.0 };

// [2.3] Bollinger Bands: the average of this many closes, with the outer
// bands this many standard deviations away.
export const BOLLINGER_PERIOD = 20;
export const BOLLINGER_DEVIATIONS = 2;

// [2.5] A swing high's high must be above this many bars on each side (a
// swing low's low below them), so it is confirmed this many bars later.
export const SWING_K = 2;

// [2.5] The middle of the dealing range, as shares of it, where entries are
// avoided.
export const MID_RANGE = { from: 0.4, to: 0.6 };

// [2.6] Displacement: a body at least DISP_MULT times the average body of the
// DISP_LOOKBACK bars before it, filling at least DISP_BODY_SHARE of its range.
export const DISP_MULT = 2.0;
export const DISP_LOOKBACK = 10;
export const DISP_BODY_SHARE = 0.6;

// Bars from the regular session only (9:30 AM to 4:00 PM New York, 6:30 AM to
// 1:00 PM Pacific), like thinkorswim's default chart. The user's choice; it
// isn't in setups.md.
export const EXTENDED_HOURS = false;

// [3.1] The 1m confidence check: room from the entry candle's close to the
// 1m outer band in the trade direction of at least ROOM_MIN times the 1m
// ATR. Measuring from the close is the user's reading of the rule.
export const ROOM_MIN = 0.5;

// [2.7] Trendlines go through swing points with this many bars on each side,
// fewer than SWING_K so touches a couple of bars apart can form a line, as in
// the four-touch example. The user's choice; setups.md uses swing points.
export const TRENDLINE_K = 1;

// [2.7] "At the line": within TOL times the ATR of it. "Moved away": at least
// BOUNCE times the ATR from it.
export const TOL = 0.1;
export const BOUNCE = 0.25;

// [2.8] After a close through a line: accepted after N_ACC more closes beyond
// it; reclaimed by a close back inside within N_RECLAIM bars.
export const N_ACC = 2;
export const N_RECLAIM = 3;

// [3.2] A four-touch break is valid when its bar's body is at least DISP_4X
// times the average body of the DISP_4X_LOOKBACK bars before it.
export const DISP_4X = 4.0;
export const DISP_4X_LOOKBACK = 4;

// [3.2] A four-touch line's spacing is good when the gaps between touches
// vary little (coefficient of variation at most SPACING_CV_MAX) or one gap is
// at most CLOSE_GAP_SHARE of the average gap.
export const SPACING_CV_MAX = 0.35;
export const CLOSE_GAP_SHARE = 1 / 3;

// [3.1] SPY's 1m reaction at T1: rejected by a close REJECT_DIST ATRs back
// within REJECT_BARS bars of the touch; oscillating when closes switch sides
// twice within OSC_BARS bars; ripped by a displacement close beyond with no
// close back within RIP_BARS bars.
export const REJECT_DIST = 0.5;
export const REJECT_BARS = 3;
export const OSC_BARS = 10;
export const RIP_BARS = 3;

// [5] The planned time stop S3: out if T1 isn't reached within this many
// minutes of the entry.
export const TIME_STOP = 15;

// [8] No entries inside these windows, each from its start up to its end. As
// New York times, the clock the app keeps; setups.md writes them on the
// user's Pacific clock (6:30-6:45, 8:00-11:00, 11:45-12:00).
export const LOCKOUTS = [
  ['09:30', '09:45'],
  ['11:00', '14:00'],
  ['14:45', '15:00'],
];

// [8] Contracts per trade.
export const SIZE_MIN = 1;
export const SIZE_MAX = 2;
