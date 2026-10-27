// Longer bars (5m, 15m) built from minute bars. Bars use Alpaca's keys: `t`
// is the bar's start time, then o, h, l, c, v; oldest first.

const MINUTE = 60_000;

// Combines minute bars into `minutes`-long bars. Periods line up with the
// clock (13:30, 13:45, ...), and since New York's offset from UTC is a whole
// number of hours, bars start at the 9:30 open when `minutes` divides 30
// (1, 5, 15, 30); a 7m or 60m period wouldn't. A period counts once it has
// ended by `asOf`, by default the end of the last minute bar, so a bar still
// forming is left out and nothing reads ahead. That default also holds back a
// finished period whose last minutes had no trades (gaps on the IEX feed), so
// pass `asOf` (the time now) when the latest bar matters.
export function resample(bars, minutes, { asOf } = {}) {
  if (bars.length === 0) return [];
  const period = minutes * MINUTE;
  const cutoff = asOf ? asOf.getTime() : Date.parse(bars.at(-1).t) + MINUTE;

  const out = [];
  let current = null;
  for (const bar of bars) {
    const start = Math.floor(Date.parse(bar.t) / period) * period;
    if (current?.start !== start) {
      current = { start, o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: 0 };
      out.push(current);
    }
    current.h = Math.max(current.h, bar.h);
    current.l = Math.min(current.l, bar.l);
    current.c = bar.c;
    current.v += bar.v;
  }

  return out
    .filter(({ start }) => start + period <= cutoff)
    .map(({ start, o, h, l, c, v }) => ({ t: new Date(start).toISOString(), o, h, l, c, v }));
}
