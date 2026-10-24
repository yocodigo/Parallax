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
