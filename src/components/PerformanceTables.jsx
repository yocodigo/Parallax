'use client';

import { formatProfitLoss } from '@/lib/format';

const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
const plainMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

// A ratio or average that can't be worked out (no losses, no trades) is a dash.
const orDash = (format) => (value) => (value === null || value === undefined ? '–' : format(value));
const pct = orDash(percent.format);
const signed = orDash(formatProfitLoss);
const ratio = orDash((v) => v.toFixed(2));

// "2026-03" as "Mar 2026". The month is already a New York one, so it is read
// as a plain date (UTC) and never shifted by the viewer's zone.
const monthLabel = (month) => monthName.format(new Date(`${month}-01T00:00:00Z`));

// The columns of `summarize` (dashboard.md section 1), gross and net side by
// side and each labelled. Win and loss counts are judged on gross P/L.
const COLUMNS = [
  ['Trades', (s) => s.trades],
  ['Wins', (s) => s.wins],
  ['Losses', (s) => s.losses],
  ['Scratches', (s) => s.scratches],
  ['Win rate', (s) => pct(s.winRate)],
  ['Breakeven win rate', (s) => pct(s.breakevenWinRate)],
  ['Avg win', (s) => signed(s.avgWin)],
  ['Avg loss', (s) => signed(s.avgLoss)],
  ['Payoff ratio', (s) => ratio(s.payoffRatio)],
  ['Gross P/L', (s) => signed(s.grossPnl)],
  ['Fees', (s) => plainMoney.format(s.fees)],
  ['Net P/L', (s) => signed(s.netPnl)],
  ['Profit factor (gross)', (s) => ratio(s.profitFactor)],
  ['Profit factor (net)', (s) => ratio(s.netProfitFactor)],
  ['Expectancy (gross)', (s) => signed(s.expectancy)],
  ['Expectancy (net)', (s) => signed(s.netExpectancy)],
];

const th = 'whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-gray-500';
const td = 'whitespace-nowrap px-3 py-1.5 text-right text-gray-900 tabular-nums';
const rowHead = 'whitespace-nowrap px-3 py-1.5 text-left font-medium text-gray-700';

function Table({ label, firstColumn, rows, columns, children }) {
  return (
    <section className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700">{label}</h2>
      {children}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table aria-label={label} className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th scope="col" className={`${th} text-left`}>
                  {firstColumn}
                </th>
                {columns.map(([name]) => (
                  <th key={name} scope="col" className={th}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ key, name, values }) => (
                <tr key={key}>
                  <th scope="row" className={rowHead}>
                    {name}
                  </th>
                  {columns.map(([column, read]) => (
                    <td key={column} className={td}>
                      {read(values)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const ADHERENCE_COLUMNS = [
  ['Kept', (g) => g.ok],
  ['Broken', (g) => g.missed],
  ['Share kept', (g) => (g.ok + g.missed === 0 ? '–' : percent.format(g.ok / (g.ok + g.missed)))],
  ['Cost of broken', (g) => formatProfitLoss(g.cost)],
];

// The section 3 tables (dashboard.md): the monthly summary, year to date, and
// rule adherence, from the performance route's `months`, `yearToDate`, and
// `adherence`.
export default function PerformanceTables({ months, yearToDate, adherence }) {
  return (
    <div className="space-y-6">
      <Table
        label="Monthly summary"
        firstColumn="Month"
        columns={COLUMNS}
        rows={months.map((m) => ({ key: m.month, name: monthLabel(m.month), values: m }))}
      >
        {months.length === 0 && <p className="text-sm text-gray-500">No closed trades in this range.</p>}
      </Table>
      <Table
        label="Year to date"
        firstColumn="Range"
        columns={COLUMNS}
        rows={[{ key: 'total', name: 'Total', values: yearToDate }]}
      />
      <Table
        label="Rule adherence"
        firstColumn="Rule"
        columns={ADHERENCE_COLUMNS}
        rows={[
          { key: 'window', name: 'Window OK', values: adherence.window },
          { key: 'size', name: 'Size OK', values: adherence.size },
        ]}
      >
        <p className="text-xs text-gray-500">
          Option trades only ({adherence.trades} closed with a P/L). The cost is the net P/L of the trades that broke
          the rule. Plan OK, Stop OK, Exit OK, and the discipline score aren&apos;t defined yet.
        </p>
      </Table>
    </div>
  );
}
