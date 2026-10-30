// Test bars for the reversal sequence detector (setups.md 3.3): a flat
// 100-level tape with five swing points cut into it — two equal highs
// forming the target pool, a single lower high for the MSS line, and two
// equal lows forming the pool that gets swept — then a sweep bar and a
// displacement bar that reclaims everything and breaks the lower high in
// one move, leaving a gap behind it.
const baseline = () => ({ o: 100, h: 100.5, l: 99.5, c: 100 });

export const TARGET_POOL = [20, 28];
export const LOWER_HIGH = 34;
export const SWEPT_POOL = [40, 48];
export const SWEEP = 65;
export const DISPLACEMENT = 66;
export const AFTER = 67;

export function reversalBars() {
  const bars = Array.from({ length: 51 }, baseline);
  bars[TARGET_POOL[0]] = { o: 100, h: 103.0, l: 99.5, c: 100 };
  bars[TARGET_POOL[1]] = { o: 100, h: 103.04, l: 99.5, c: 100 };
  bars[LOWER_HIGH] = { o: 100, h: 101.0, l: 99.5, c: 100 };
  bars[SWEPT_POOL[0]] = { o: 100, h: 100.5, l: 97.5, c: 100 };
  bars[SWEPT_POOL[1]] = { o: 100, h: 100.5, l: 97.56, c: 100 };
  while (bars.length < SWEEP) bars.push(baseline());
  // Trades below the swept pool's low (97.50) and closes back above it.
  bars[SWEEP] = { o: 100, h: 100.5, l: 97.0, c: 97.6 };
  // Reclaims past the pool's high (97.56) and the lower high (101.00) in
  // one bar, with a big enough body to count as displacement.
  bars[DISPLACEMENT] = { o: 97.6, h: 103.5, l: 97.4, c: 103.0 };
  // Low stays above the sweep bar's high (100.5), leaving a gap behind it.
  bars[AFTER] = { o: 103, h: 104, l: 102.0, c: 103.5 };
  return bars;
}
