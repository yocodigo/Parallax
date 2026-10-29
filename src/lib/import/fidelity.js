// Reads stock fills from a Fidelity account history export (Activity &
// Orders > History, "Download" as CSV): one flat table, no sections.
//
// Unlike thinkorswim's statement, there's no time of day, only a trade date;
// every fill reads as the New York open (9:30 AM), a placeholder Joel chose
// since nothing finer survives the export. There's no reference number
// either, so `ref` is a synthetic, display-only label.
//
// Only "YOU BOUGHT"/"YOU SOLD" rows are read as trades; everything else
// (dividends, reinvestments, transfers, interest) is listed as not
// understood. A one-off automatic money-market sweep would also read as
// "YOU BOUGHT"/"YOU SOLD" if Fidelity ever logs one that way — watch for
// that in the import's preview before confirming.

const HEADER = 'Run Date';

// Splits one CSV line, honoring quotes ("-10", "$1,197.14").
function splitCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else field += char;
  }
  fields.push(field);
  return fields;
}

// "-10", "0.05", "" -> 0.
const amount = (text) => (text ? Number(text.replace(/[$,]/g, '')) : 0);
const cents = (value) => Math.round(value * 100) / 100;

// How far New York's clocks are ahead of UTC at `instant`, in ms.
function nyOffsetAt(instant) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, Number(value)])
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - instant.getTime();
}

// 9:30 AM New York time on `date` ("MM/DD/YYYY"), across a daylight saving
// change.
function nyOpen(date) {
  const [month, day, year] = date.split('/').map(Number);
  const wall = Date.UTC(year, month - 1, day, 9, 30, 0);
  // The offset depends on the date, which is what we're solving for, so
  // resolve it twice: once from the wall time read as UTC (close enough to
  // find the right offset unless a DST change falls in the gap), then again
  // from that result, which converges on the correct instant.
  const first = wall - nyOffsetAt(new Date(wall));
  return new Date(wall - nyOffsetAt(new Date(first)));
}

// The rows of the file, as objects keyed by its header, from the header row
// (wherever it falls) to the first blank line after it.
function rowsOf(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const start = lines.findIndex((line) => splitCsvLine(line)[0] === HEADER);
  if (start === -1) return null;
  const header = splitCsvLine(lines[start]);
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') break;
    const fields = splitCsvLine(line);
    rows.push(Object.fromEntries(header.map((name, i) => [name, fields[i] ?? ''])));
  }
  return rows;
}

// A stock fill from a row, or null when the action isn't a trade. `index`
// only makes the synthetic `ref` unique within this parse.
function fill(row, index) {
  if (!/^YOU (BOUGHT|SOLD)\b/.test(row.Action)) return null;
  const quantity = amount(row.Quantity);
  return {
    ref: `${row['Run Date']}#${index}`,
    executedAt: nyOpen(row['Run Date']),
    side: quantity < 0 ? 'sell' : 'buy',
    quantity: Math.abs(quantity),
    symbol: row.Symbol,
    assetClass: 'stock',
    optionType: null,
    strike: null,
    expiration: null,
    multiplier: 1,
    price: amount(row['Price ($)']),
    fees: cents(amount(row['Commission ($)']) + amount(row['Fees ($)'])),
  };
}

// Returns { fills, skipped }: the stock fills in the order listed, and the
// rows that aren't a trade, each with its description. Or { error } when the
// text isn't a Fidelity account history.
export function parseFidelityHistory(text) {
  const rows = rowsOf(text);
  if (!rows) return { error: 'This is not a Fidelity account history: it has no Run Date column.' };

  const fills = [];
  const skipped = [];
  rows.forEach((row, index) => {
    const f = fill(row, index);
    if (f) fills.push(f);
    else skipped.push({ description: row.Action });
  });
  return { fills, skipped };
}
