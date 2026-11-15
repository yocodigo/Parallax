// Nearest-rank percentiles (p50, p75, p90) of `values`: the pth percentile is
// the value at 1-based rank ceil(p * n) in sorted order (so index ceil(p * n)
// - 1), always a value that actually occurred. All null for no values.
export function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => (sorted.length ? sorted[Math.ceil(p * sorted.length) - 1] : null);
  return { p50: at(0.5), p75: at(0.75), p90: at(0.9) };
}
