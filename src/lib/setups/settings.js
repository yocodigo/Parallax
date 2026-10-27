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
