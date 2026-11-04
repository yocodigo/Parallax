'use client';

import { formatProfitLoss } from '@/lib/format';

const COLUMNS = [
  ['live', 'Live'],
  ['paper', 'Paper'],
  ['backtest', 'Backtest'],
];

const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });

// Each row says whether it is before or after fees, as the headline strip does:
// wins and losses are judged on gross P/L, expectancy and profit factor are net.
const ROWS = [
  ['Trades', (s) => String(s.trades)],
  ['Win rate (gross P/L)', (s) => orDash(s.winRate, percent.format)],
  ['Expectancy (net)', (s) => orDash(s.netExpectancy, formatProfitLoss)],
  ['Profit factor (net)', (s) => orDash(s.netProfitFactor, (v) => v.toFixed(2))],
  ['Avg win (gross)', (s) => orDash(s.avgWin, formatProfitLoss)],
  ['Avg loss (gross)', (s) => orDash(s.avgLoss, formatProfitLoss)],
];

// A figure that can't be worked out (no trades, no losses) is a dash.
function orDash(value, format) {
  return value === null || value === undefined ? '–' : format(value);
}

// The core metrics for live, paper, and backtest trades side by side (the
// route's `modes`, dashboard.md section 4 chart 11). The three are separate
// tracks and never blended into one number.
export default function ModeComparison({ modes }) {
  const empty = COLUMNS.every(([mode]) => modes[mode].trades === 0);

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Mode comparison</h2>
        <p className="text-xs text-gray-500">
          Paper and backtest skip spread, slippage, and emotion, so read them as the idealized version of live.
        </p>
      </div>

      {empty ? (
        <p className="text-sm text-gray-500">No closed trades yet.</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-gray-500">
            <tr>
              <td />
              {COLUMNS.map(([mode, label]) => (
                <th key={mode} scope="col" className="py-1 text-right font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ROWS.map(([label, value]) => (
              <tr key={label}>
                <th scope="row" className="py-1.5 text-left font-normal text-gray-800">
                  {label}
                </th>
                {COLUMNS.map(([mode]) => (
                  <td key={mode} className="py-1.5 text-right text-gray-600">
                    {value(modes[mode])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
