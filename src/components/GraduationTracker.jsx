'use client';

import { formatProfitLoss } from '@/lib/format';

// Each gate moves a setup up from the mode before, on that mode's trades: a
// setup earns paper trading in backtest, live trading in paper, and a bigger
// size in live (dashboard.md section 8).
const GATES = [
  ['backtest', 'Backtest → paper'],
  ['paper', 'Paper → live'],
  ['live', 'Live → size up'],
];

const perTrade = (amount) => `${formatProfitLoss(amount)} per trade`;

// The status is in words, so no gate rests on color alone.
function GateCell({ cell, gradN }) {
  if (cell.window === 0) {
    return <td className="py-1.5 text-right text-gray-500">No trades yet</td>;
  }
  const filling = cell.window < gradN;
  const status = cell.met ? 'Met' : filling ? `${cell.window} of ${gradN} trades` : 'Not met';
  return (
    <td className="py-1.5 text-right">
      <span className={`block ${cell.met ? 'font-medium text-green-700' : filling ? 'text-gray-600' : 'text-gray-800'}`}>
        {status}
      </span>
      <span className="block text-xs text-gray-500">{perTrade(cell.netExpectancy)}</span>
    </td>
  );
}

// Each setup's progress through the promotion gates, and the live-minus-paper
// expectancy gap: how much execution and emotion cost against the idealized
// version (the route's `setups`, dashboard.md section 4 chart 12). A negative
// gap means the strategy may be fine and the execution isn't.
export default function GraduationTracker({ setups, gradN }) {
  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Graduation tracker</h2>
        <p className="text-xs text-gray-500">
          A setup moves up a mode once its last {gradN} closed trades there average above zero after fees. Small
          samples mislead, so treat these as hints until the counts are real. The gap appears once live and paper
          both have a full window.
        </p>
      </div>

      {setups.length === 0 ? (
        <p className="text-sm text-gray-500">No closed trades yet.</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-gray-500">
            <tr>
              <th scope="col" className="py-1 text-left font-medium">
                Setup
              </th>
              {GATES.map(([mode, label]) => (
                <th key={mode} scope="col" className="py-1 text-right font-medium">
                  {label}
                </th>
              ))}
              <th scope="col" className="py-1 text-right font-medium">
                Live − paper gap
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {setups.map((setup) => (
              <tr key={setup.strategyId ?? 'none'}>
                <th scope="row" className="py-1.5 text-left font-normal text-gray-800">
                  {setup.name ?? 'No strategy'}
                </th>
                {GATES.map(([mode]) => (
                  <GateCell key={mode} cell={setup.modes[mode]} gradN={gradN} />
                ))}
                <td className="py-1.5 text-right text-gray-600">{setup.gap === null ? '–' : perTrade(setup.gap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
