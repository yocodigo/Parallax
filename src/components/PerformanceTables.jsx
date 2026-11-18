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
  ['Loss rate', (s) => pct(s.lossRate)],
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

const thBase = 'whitespace-nowrap px-3 py-2 text-xs font-medium text-gray-500';
const th = `${thBase} text-right`;
// The first column stays put while the wide tables scroll sideways. It needs an
// opaque background, or the figures scrolling under it show through, and an
// edge, or a figure cut off beside it reads as a smaller number. The edge is a
// pseudo-element line: the tables are border-collapse, where a cell's border
// doesn't move with the cell once it is pinned, and Chrome paints no shadow on
// a collapsed table's cells.
const sticky = 'sticky left-0 bg-white after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-gray-200';
const td = 'whitespace-nowrap px-3 py-1.5 text-right text-gray-900 tabular-nums';
const rowHead = `whitespace-nowrap px-3 py-1.5 text-left font-medium text-gray-700 ${sticky}`;

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
                <th scope="col" className={`${thBase} ${sticky} text-left`}>
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
  ['Cost of broken', (g) => (g.cost === null ? '–' : formatProfitLoss(g.cost))],
];

// In the order of `violationCosts`, with the names the mistake cost ledger uses.
const VIOLATION_ROWS = [
  ['followed', 'Rules followed'],
  ['window', 'Window only'],
  ['size', 'Size only'],
  ['both', 'Window and size'],
];

const VIOLATION_COLUMNS = [
  ['Trades', (v) => v.trades],
  ['Net P/L', (v) => (v.trades === 0 ? '–' : formatProfitLoss(v.net))],
];

const HOLD_COLUMNS = [
  ['Trades', (b) => b.trades],
  ['Win rate (gross)', (b) => (b.trades === 0 ? '–' : pct(b.winRate))],
  ['Net P/L', (b) => (b.trades === 0 ? '–' : signed(b.netPnl))],
];

const EXIT_COLUMNS = [
  ['Trades', (e) => e.trades],
  ['Share of exits', (e) => pct(e.share)],
  ['Net P/L', (e) => (e.trades === 0 ? '–' : signed(e.netPnl))],
];

const BAND_NAMES = { in: 'Inside', partly: 'Partly', out: 'Outside' };
const PREMIUM_COLUMNS = [
  ...HOLD_COLUMNS,
  ['Allowed band', (b) => BAND_NAMES[b.band] ?? '–'],
];

const money = orDash(plainMoney.format);
const FRICTION_COLUMNS = [
  ['Trades', (f) => f.trades],
  ['Median win (gross)', (f) => money(f.medianWin)],
  ['Median fees', (f) => money(f.medianFees)],
  ['Median friction', (f) => money(f.medianFriction)],
  ['Share of median win', (f) => pct(f.shareOfMedianWin)],
  ['Break-even move', (f) => money(f.breakEvenMove)],
  ['Move, of premium', (f) => pct(f.breakEvenMovePct)],
];

// The section 3 tables (dashboard.md): the monthly summary, year to date, and
// rule adherence and the violation costs, from the performance route's `months`,
// `yearToDate`, `adherence`, and `violationCosts`, and, for option trades, the `execution` tables. `yearToDate` is the totals for whatever range was asked for, so
// the table is titled "Totals" and its row names that range ("2026", "All years").
export default function PerformanceTables({ months, yearToDate, adherence, violationCosts, execution, rangeLabel }) {
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
        label="Totals"
        firstColumn="Range"
        columns={COLUMNS}
        rows={[{ key: 'total', name: rangeLabel, values: yearToDate }]}
      />
      <Table
        label="Rule adherence"
        firstColumn="Rule"
        columns={ADHERENCE_COLUMNS}
        rows={[
          { key: 'window', name: 'Window OK', values: adherence.window },
          { key: 'size', name: 'Size OK', values: adherence.size },
          { key: 'plan', name: 'Plan OK', values: adherence.plan },
          { key: 'stop', name: 'Stop OK', values: adherence.stop },
          { key: 'exit', name: 'Exit OK', values: adherence.exit },
          { key: 'discipline', name: 'Discipline score', values: adherence.discipline },
        ]}
      >
        <p className="text-xs text-gray-500">
          Option trades only ({adherence.trades} closed with a P/L). The cost is the net P/L of the trades that broke
          the rule. Plan OK: a plan written before the fill, a strategy picked, and every checklist rule met. Stop OK: the
          exit was no worse than the stop; trades with no stop aren&apos;t judged. Exit OK: the recorded exit reason was a
          planned one, not a discomfort exit. Discipline score: the Plan OK, Stop OK, and Exit OK checks passed out of the
          ones that applied (Window OK and Size OK aren&apos;t in it). It has no cost, since one trade can fail
          several checks. Window OK: an entry outside every window holds it, and one inside holds it only with a detected
          setup that clears the window (a complete setup within 3 bars, or a valid grade A four-touch break); an entry
          from before setups were detected isn&apos;t judged.
        </p>
      </Table>
      <Table
        label="Rule violations"
        firstColumn="Rules broken"
        columns={VIOLATION_COLUMNS}
        rows={VIOLATION_ROWS.map(([key, name]) => ({ key, name, values: violationCosts[key] }))}
      >
        <p className="text-xs text-gray-500">
          Option trades only. Each trade is in one row, so a trade that broke both rules is counted in the last row
          alone and the rows add up to the total.
        </p>
      </Table>
      {execution && (
        <Table
          label="Hold time"
          firstColumn="Held"
          columns={HOLD_COLUMNS}
          rows={execution.holdTime.map((bucket) => ({ key: bucket.key, name: bucket.label, values: bucket }))}
        >
          <p className="text-xs text-gray-500">
            Option trades only, by how long the position was held from the entry fill to the exit.
          </p>
        </Table>
      )}
      {execution && (
        <Table
          label="Exit triggers"
          firstColumn="Exit"
          columns={EXIT_COLUMNS}
          rows={[
            {
              key: 'triggered',
              name: 'Backstop or time stop',
              values: {
                ...execution.exits.triggered,
                share: execution.exits.untriggeredShare === null ? null : 1 - execution.exits.untriggeredShare,
              },
            },
            {
              key: 'untriggered',
              name: 'No trigger',
              values: { ...execution.exits.untriggered, share: execution.exits.untriggeredShare },
            },
          ]}
        >
          <p className="text-xs text-gray-500">
            Option trades only. An exit is triggered when it sold at or under the backstop level or held as long as the
            time stop; every other exit was nobody&apos;s rule. Only those two triggers count for now.
          </p>
        </Table>
      )}
      {execution && (
        <Table
          label="Friction"
          firstColumn="Per round trip"
          columns={FRICTION_COLUMNS}
          rows={[{ key: 'friction', name: 'Median option trade', values: execution.friction }]}
        >
          <p className="text-xs text-gray-500">
            Option trades only. Friction is the fees plus an estimated spread (the quotes aren&apos;t stored, so the
            spread is assumed). Break-even move is the premium, per share and as a share of what was paid, the
            position has to gain before a round trip makes money.
          </p>
        </Table>
      )}
      {execution && (
        <Table
          label="Entry premium"
          firstColumn="Premium paid"
          columns={PREMIUM_COLUMNS}
          rows={execution.premiumBand.map((bucket) => ({ key: bucket.key, name: bucket.label, values: bucket }))}
        >
          <p className="text-xs text-gray-500">
            Option trades only, by the premium paid per share. Allowed band: whether the bucket lies inside the premium
            band in the option rules, partly inside it, or outside it; blank while that rule is off.
          </p>
        </Table>
      )}
    </div>
  );
}
