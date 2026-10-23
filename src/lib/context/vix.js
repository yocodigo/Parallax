// Cboe's free daily VIX history (https://cdn.cboe.com/api/global/us_indices/
// daily_prices/VIX_History.csv): one row per session, DATE as MM/DD/YYYY.

// [{ date: 'YYYY-MM-DD', close }], oldest first.
export function parseVixCsv(text) {
  const rows = [];
  for (const line of text.split('\n').slice(1)) {
    const [date, , , , close] = line.trim().split(',');
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date ?? '');
    const value = Number(close);
    if (match && Number.isFinite(value)) rows.push({ date: `${match[3]}-${match[1]}-${match[2]}`, close: value });
  }
  return rows;
}

const FLAT_PERCENT = 5;

// The VIX close before a New York date ('YYYY-MM-DD'), so never the entry
// day's own close, with whether it was rising, falling, or flat against five
// sessions earlier. Null without an earlier close.
export function vixBefore(rows, date) {
  const earlier = rows.filter((row) => row.date < date);
  const last = earlier.at(-1);
  if (!last) return null;

  const weekAgo = earlier.at(-6);
  let direction = null;
  if (weekAgo) {
    const change = ((last.close - weekAgo.close) / weekAgo.close) * 100;
    direction = change > FLAT_PERCENT ? 'rising' : change < -FLAT_PERCENT ? 'falling' : 'flat';
  }
  return { close: last.close, date: last.date, direction };
}
