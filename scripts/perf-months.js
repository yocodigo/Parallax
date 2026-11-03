// Prints the monthly performance table and the year's totals from the
// journal's database (DATABASE_URL), to reconcile imported trades against the
// spreadsheet (docs/private/dashboard.md section 6). Read-only; the numbers
// stay in the terminal. Run with `npm run perf:months -- --mode=live
// --year=2026 --asset=option`; every flag is optional (live, the current
// year, and every asset class by default). Runs under tsx like seed-demo.js.
import { loadEnvConfig } from '@next/env';
import { and, eq, gte, isNotNull, lt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema';
import { trades } from '../src/db/schema';
import { monthlySummary, summarize } from '../src/lib/performance';

function flags(argv) {
  return Object.fromEntries(
    argv.filter((arg) => arg.startsWith('--')).map((arg) => arg.slice(2).split('='))
  );
}

const money = (value) => value.toFixed(2);
const percent = (value) => (value === null ? '-' : `${(value * 100).toFixed(1)}%`);

function row(label, s) {
  return [
    label,
    s.trades,
    `${s.wins} / ${s.losses} / ${s.scratches}`,
    percent(s.winRate),
    money(s.grossPnl),
    money(-s.fees),
    money(s.netPnl),
  ];
}

function printTable(rows) {
  const header = ['Month', 'Trades', 'W / L / S', 'Win rate', 'Gross P/L', 'Fees', 'Net P/L'];
  const all = [header, ...rows].map((cells) => cells.map(String));
  const widths = header.map((_, i) => Math.max(...all.map((cells) => cells[i].length)));
  for (const cells of all) {
    console.log(cells.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('  '));
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  const { mode = 'live', year = String(new Date().getFullYear()), asset } = flags(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL (in .env.local) to the journal database.');
    return 1;
  }

  const db = drizzle(process.env.DATABASE_URL, { schema });
  try {
    // The New York calendar year. January 1 is always on standard time
    // (UTC-5), so its midnight is 05:00 UTC.
    const closed = await db
      .select()
      .from(trades)
      .where(
        and(
          isNotNull(trades.closedAt),
          eq(trades.mode, mode),
          asset ? eq(trades.assetClass, asset) : undefined,
          gte(trades.closedAt, new Date(`${year}-01-01T05:00:00Z`)),
          lt(trades.closedAt, new Date(`${Number(year) + 1}-01-01T05:00:00Z`))
        )
      );
    const months = monthlySummary(closed);

    console.log(`${mode} trades closed in ${year}${asset ? `, ${asset} only` : ''}. Fees are commissions and misc together.\n`);
    if (!months.length) {
      console.log('No closed trades.');
      return 0;
    }
    printTable([...months.map((m) => row(m.month, m)), row('YTD', summarize(closed))]);
    return 0;
  } finally {
    await db.$client.end();
  }
}

main().then((code) => {
  process.exitCode = code;
});
