'use client';

import { formatProfitLoss } from '@/lib/format';

const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });

const LABELS = { true: 'Plan written first', false: 'No plan before the fill' };

const money = (amount) => (amount === null ? '—' : formatProfitLoss(amount));

// Closed trades with a plan entry written before the fill against those without (the
// route's `plansVsNoPlan`), in the page's filters. Win rate is on gross P/L; net P/L and
// expectancy are net of fees.
export default function PlansVsNoPlan({ rows }) {
  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Plan vs no plan</h2>
        <p className="text-xs text-gray-500">
          Trades with a plan entry written before the fill, against the rest. Win rate is gross; the dollars are net.
        </p>
      </div>

      {rows.every((row) => row.trades === 0) ? (
        <p className="text-sm text-gray-500">No closed trades in this range.</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th scope="col" className="py-1 font-medium">
                Group
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Trades
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Net P/L
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Win rate
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Per trade
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.planned)} className="border-t border-gray-100">
                <th scope="row" className="py-1.5 text-left font-medium text-gray-900">
                  {LABELS[row.planned]}
                </th>
                <td className="py-1.5 text-right">{row.trades}</td>
                <td className="py-1.5 text-right">{row.trades ? money(row.netPnl) : '—'}</td>
                <td className="py-1.5 text-right">{row.winRate === null ? '—' : percent.format(row.winRate)}</td>
                <td className="py-1.5 text-right">{money(row.netExpectancy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
