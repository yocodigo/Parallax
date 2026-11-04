'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { fetchJson } from '@/lib/fetchJson';
import { formatProfitLoss } from '@/lib/format';
import { inputClass } from './Field';
import EquityCurve from './EquityCurve';
import GraduationTracker from './GraduationTracker';
import MistakeCostLedger from './MistakeCostLedger';
import ModeComparison from './ModeComparison';
import MonthlyPnl from './MonthlyPnl';
import RollingExpectancy from './RollingExpectancy';
import PerformanceTables from './PerformanceTables';
import WinRateVsBreakeven from './WinRateVsBreakeven';
import TimeOfDay from './TimeOfDay';

const MODES = [
  ['live', 'Live'],
  ['paper', 'Paper'],
  ['backtest', 'Backtest'],
];

const ASSETS = [
  ['', 'All'],
  ['stock', 'Stocks'],
  ['option', 'Options'],
  ['crypto', 'Crypto'],
];

const SIDES = [
  ['', 'Both'],
  ['call', 'Calls'],
  ['put', 'Puts'],
];

const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });

// A ratio or percent that can't be worked out (no losses, no trades) is a dash.
const orDash = (value, format) => (value === null || value === undefined ? '–' : format(value));

// The route filters by New York calendar year, so the picker offers this year
// and the five before it, then every year.
const nyYear = () =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date()));

const TABS = [
  ['charts', 'Charts'],
  ['tables', 'Tables'],
];

// Charts or the full tables (dashboard.md section 3) over the same filters.
function Tabs({ value, onChange }) {
  return (
    <div role="tablist" aria-label="View" className="flex gap-1 border-b border-gray-200">
      {TABS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${
            value === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Select({ label, value, onChange, options, disabled = false }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-gray-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${inputClass} disabled:opacity-50`}
      >
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

// Each figure says whether it is before or after fees: wins and losses are
// judged on gross P/L, the rest are shown net (dashboard.md section 1).
function HeadlineStrip({ yearToDate, equity }) {
  const drawdown = equity.at(-1)?.drawdown ?? 0;
  const stats = [
    ['Net P/L (net)', formatProfitLoss(yearToDate.netPnl)],
    ['Win rate (gross P/L)', orDash(yearToDate.winRate, percent.format)],
    ['Profit factor (net)', orDash(yearToDate.netProfitFactor, (v) => v.toFixed(2))],
    ['Expectancy (net)', orDash(yearToDate.netExpectancy, formatProfitLoss)],
    ['Drawdown (net)', drawdown > 0 ? formatProfitLoss(-drawdown) : 'At peak'],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {stats.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <dt className="text-xs text-gray-500">{label}</dt>
          <dd className="mt-1 text-lg font-semibold text-gray-900 tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// The modes side by side and each setup's progress through the promotion gates
// (dashboard.md sections 4 and 8). They compare the modes with each other, so
// the page's Mode and Year filters don't apply: the others do. Left out while
// loading, and when nothing has closed in any mode (the page's own empty state
// already says to import); an error shows beside the charts.
function AllModes({ filters }) {
  const query = new URLSearchParams(filters).toString();
  const { data, error } = useSWR(`/api/insights/modes${query ? `?${query}` : ''}`, fetchJson, {
    revalidateOnFocus: false,
  });

  if (error) {
    return (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error.message}
      </div>
    );
  }
  if (!data || Object.values(data.modes).every((mode) => mode.trades === 0)) return null;
  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">Across all modes and years; the Mode and Year filters don&apos;t apply.</p>
      <ModeComparison modes={data.modes} />
      <GraduationTracker setups={data.setups} gradN={data.gradN} />
    </div>
  );
}

// The landing view (dashboard.md section 2): headline figures, the equity
// curve, then a grid of the core charts, for one mode, asset, and year.
export default function PerformanceDashboard() {
  const thisYear = nyYear();
  const [mode, setMode] = useState('live');
  const [asset, setAsset] = useState('');
  const [year, setYear] = useState(String(thisYear));
  const [strategyId, setStrategyId] = useState('');
  const [pickedSide, setPickedSide] = useState('');
  const [tab, setTab] = useState('charts');
  // Only options are calls or puts, so the pick is off (and not sent) for stocks and crypto;
  // it comes back if the asset does.
  const sideApplies = asset === '' || asset === 'option';
  const optionType = sideApplies ? pickedSide : '';

  const { data: strategyData } = useSWR('/api/strategies', fetchJson, { revalidateOnFocus: false });
  const setups = [
    ['', 'All setups'],
    ...(strategyData?.strategies ?? []).map((strategy) => [strategy.id, strategy.name]),
    ['none', 'No setup'],
  ];

  // The filters both routes share; only the performance one also takes mode and year.
  const filters = {
    ...(asset && { asset }),
    ...(strategyId && { strategyId }),
    ...(optionType && { optionType }),
  };
  const query = new URLSearchParams({ mode, ...filters, year });
  const { data, error, isLoading } = useSWR(`/api/insights/performance?${query}`, fetchJson, {
    revalidateOnFocus: false,
  });

  let body;
  if (isLoading) {
    body = <p className="text-sm text-gray-500">Loading…</p>;
  } else if (error) {
    body = (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error.message}
      </div>
    );
  } else if (data.yearToDate.trades === 0) {
    body = (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
        <p>No closed trades for these filters in {year === 'all' ? 'any year' : year}. Try widening the filters, or import an account statement to fill the charts.</p>
        <Link href="/import" className="mt-3 inline-block font-medium text-blue-700 hover:underline">
          Import trades
        </Link>
      </div>
    );
  } else {
    body = (
      <div className="space-y-6">
        <HeadlineStrip yearToDate={data.yearToDate} equity={data.equity} />
        {tab === 'charts' ? (
          <>
            <EquityCurve points={data.equity} />
            <div className="grid gap-6 lg:grid-cols-2">
              <MonthlyPnl months={data.months} />
              <MistakeCostLedger costs={data.violationCosts} />
              <TimeOfDay buckets={data.timeOfDay} />
              <RollingExpectancy points={data.rolling} />
              <WinRateVsBreakeven months={data.months} />
            </div>
          </>
        ) : (
          <PerformanceTables
            months={data.months}
            yearToDate={data.yearToDate}
            adherence={data.adherence}
            violationCosts={data.violationCosts}
            rangeLabel={year === 'all' ? 'All years' : year}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <Select label="Mode" value={mode} onChange={setMode} options={MODES} />
        <Select label="Asset" value={asset} onChange={setAsset} options={ASSETS} />
        <Select label="Setup" value={strategyId} onChange={setStrategyId} options={setups} />
        <Select label="Call/Put" value={optionType} onChange={setPickedSide} options={SIDES} disabled={!sideApplies} />
        <Select
          label="Year"
          value={year}
          onChange={setYear}
          options={[
            ...Array.from({ length: 6 }, (_, i) => [String(thisYear - i), String(thisYear - i)]),
            ['all', 'All years'],
          ]}
        />
      </div>
      <Tabs value={tab} onChange={setTab} />
      {body}
      {tab === 'charts' && <AllModes filters={filters} />}
    </div>
  );
}
