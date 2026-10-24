// Threshold checks for values computed from prices, such as ratios and price
// differences. Prices like 761.10 aren't exact in binary, so a ratio that is
// exactly 0.25 on paper can compute as 0.2500000000001. These checks allow
// for that with an absolute tolerance, which suits values up to the
// thousands; compare raw share volumes as ratios rather than directly.

const EPSILON = 1e-9;

export const atMost = (value, limit) => value <= limit + EPSILON;
export const atLeast = (value, limit) => value >= limit - EPSILON;
