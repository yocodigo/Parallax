// Threshold checks for ratios computed from prices. Prices like 761.10 aren't
// exact in binary, so a ratio that is exactly 0.25 on paper can compute as
// 0.2500000000001. These checks allow for that.

const EPSILON = 1e-9;

export const atMost = (value, limit) => value <= limit + EPSILON;
export const atLeast = (value, limit) => value >= limit - EPSILON;
