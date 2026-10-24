// Reads fills from a thinkorswim (Schwab) account statement export: the CSV
// from Monitor > Account Statement > Export to File.
//
// The fills come from the Cash Balance section. Unlike the trade history
// sections, it lists every trade with its fees and reference number and
// isn't narrowed by the statement's symbol filter.

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

// "BOT +1 SPY 100 (Weeklys) 23 OCT 26 761 PUT @1.30 CBOE": side, quantity,
// underlying, multiplier, an optional label, expiration, strike, type, price,
// and sometimes the exchange.
const OPTION_TRADE =
  /^(BOT|SOLD) ([+-][\d,]+) ([A-Z.]+) (\d+)(?: \([^)]*\))? (\d{1,2}) ([A-Z]{3}) (\d{2}) ([\d.]+) (CALL|PUT) @([\d.]+)(?: [A-Z]+)?$/;

// Splits one CSV line, honoring quotes ("$1,197.14").
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

// "-0.65", "" -> 0.
const amount = (text) => (text ? Number(text.replace(/[$,]/g, '')) : 0);
const cents = (value) => Math.round(value * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

// The rows of the section titled `title`, as objects keyed by its header.
function section(lines, title) {
  const start = lines.findIndex((line) => line.trim() === title);
  if (start === -1) return null;
  const header = splitCsvLine(lines[start + 1]);
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (line.trim() === '') break;
    const fields = splitCsvLine(line);
    rows.push(Object.fromEntries(header.map((name, i) => [name, fields[i] ?? ''])));
  }
  return rows;
}

// How far `timeZone`'s clocks are ahead of UTC at `instant`, in ms.
function offsetAt(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
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

// The instant when clocks in `timeZone` read "MM/DD/YY" "HH:MM:SS".
function zonedTime(date, time, timeZone) {
  const [month, day, year] = date.split('/').map(Number);
  const [hour, minute, second] = time.split(':').map(Number);
  const wall = Date.UTC(2000 + year, month - 1, day, hour, minute, second);
  // Take the offset at the wall time read as UTC, then once more at the
  // result, in case a daylight saving change falls between the two.
  const first = wall - offsetAt(new Date(wall), timeZone);
  return new Date(wall - offsetAt(new Date(first), timeZone));
}

function optionFill(row, timeZone) {
  const match = OPTION_TRADE.exec(row.DESCRIPTION.trim());
  if (!match) return null;
  const [, side, quantity, symbol, multiplier, day, month, year, strike, type, price] = match;
  if (!MONTHS[month]) return null;
  return {
    ref: row.ref,
    executedAt: zonedTime(row.DATE, row.TIME, timeZone),
    side: side === 'BOT' ? 'buy' : 'sell',
    quantity: Math.abs(Number(quantity.replace(/,/g, ''))),
    symbol,
    assetClass: 'option',
    optionType: type.toLowerCase(),
    strike: Number(strike),
    expiration: `20${year}-${pad(MONTHS[month])}-${pad(day)}`,
    multiplier: Number(multiplier),
    price: Number(price),
    fees: cents(-(amount(row['Misc Fees']) + amount(row['Commissions & Fees']))),
  };
}

// Returns { fills, skipped }: the option fills in the order listed, with
// times read in `timeZone` (the one thinkorswim is set to), and the trade
// rows it doesn't understand, such as stock trades for now. Or { error } when
// the text isn't an account statement.
export function parseThinkorswimStatement(text, { timeZone }) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const rows = section(lines, 'Cash Balance');
  if (!rows) return { error: 'This is not a thinkorswim account statement: it has no Cash Balance section.' };

  const fills = [];
  const skipped = [];
  for (const row of rows) {
    if (row.TYPE !== 'TRD') continue;
    // Written as ="1008422350060" so spreadsheets keep it as text.
    row.ref = row['REF #'].replace(/^="?|"$/g, '');
    const fill = optionFill(row, timeZone);
    if (fill) fills.push(fill);
    else skipped.push({ ref: row.ref, description: row.DESCRIPTION.trim() });
  }
  return { fills, skipped };
}
