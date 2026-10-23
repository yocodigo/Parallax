'use client';

import useSWR from 'swr';
import { fetchJson } from '@/lib/fetchJson';

const SESSION_PARTS = { open: 'First 30 minutes', midday: 'Midday', close: 'Last 30 minutes' };

const UNAVAILABLE = {
  sectorTrend: 'sector trend',
  earnings: 'earnings',
  exDividend: 'ex-dividend dates',
  ivRank: 'IV rank',
};

const NA = 'n/a';
const signed = (value, unit) => (value === null ? NA : `${value > 0 ? '+' : ''}${value}${unit}`);

function timeOfDay({ sessionPart, minutesSinceOpen }) {
  if (!sessionPart) return 'Outside regular hours';
  return `${SESSION_PARTS[sessionPart]}, ${minutesSinceOpen} minutes after the open`;
}

function market({ spyTrend, qqqTrend, vix }) {
  const vixText = vix ? `${vix.close}${vix.direction ? ` (${vix.direction})` : ''}` : NA;
  return `SPY ${spyTrend ?? NA} · QQQ ${qqqTrend ?? NA} · VIX ${vixText}`;
}

function releases(events) {
  if (!events) return 'Scheduled releases: unknown for this date.';
  return `That day: ${events.today.join(', ') || 'none'}. Next weekday: ${events.nextWeekday.join(', ') || 'none'}.`;
}

function stock(s) {
  const at = s.price === null ? '' : ` at ${s.price}`;
  return [
    `${s.symbol}${at}: trend ${s.trend ?? NA}`,
    `gap ${signed(s.gapPercent, '%')}`,
    `relative volume ${s.relativeVolume === null ? NA : `${s.relativeVolume}×`}`,
    `vs SPY (20 days) ${signed(s.relativeStrength, ' pts')}`,
  ].join(' · ');
}

function option(o) {
  return [
    `${o.dte} DTE`,
    o.openInterest !== null && `open interest ${o.openInterest.toLocaleString('en-US')}`,
    o.bid !== null && `bid ${o.bid} / ask ${o.ask}${o.spreadPercent !== null ? ` (spread ${o.spreadPercent}%)` : ''}`,
    o.iv !== null && `IV ${(o.iv * 100).toFixed(1)}%`,
    o.delta !== null && `delta ${o.delta.toFixed(2)}`,
    o.expectedMove !== null && `expected move ±${o.expectedMove}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function Row({ label, children }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-gray-500">{label}</dt>
      <dd className="text-gray-800">{children}</dd>
    </div>
  );
}

// The market context saved when the trade's entry was recorded.
export default function TradeContext({ tradeId }) {
  const { data, error, isLoading } = useSWR(`/api/trades/${tradeId}/context`, fetchJson, {
    revalidateOnFocus: false,
  });

  if (isLoading) return <p className="text-xs text-gray-500">Loading context…</p>;
  if (error) return <p className="text-xs text-red-700">{error.message}</p>;

  const context = data.context;
  if (!context) return <p className="text-xs text-gray-500">No context was captured for this entry.</p>;

  return (
    <div className="space-y-1.5 rounded-md bg-gray-50 p-3 text-xs">
      <dl className="space-y-1">
        <Row label="Time">{timeOfDay(context.timeOfDay)}</Row>
        <Row label="Market">{market(context.market)}</Row>
        <Row label="Releases">{releases(context.market.events)}</Row>
        <Row label="Stock">{stock(context.stock)}</Row>
        {context.option && <Row label="Option">{option(context.option)}</Row>}
      </dl>
      {context.option?.liveSkipped && (
        <p className="text-gray-500">
          Quote, IV, and delta not captured: the entry was recorded more than 15 minutes after the fill.
        </p>
      )}
      <p className="text-gray-500">
        {`Not captured: ${context.unavailable.map((name) => UNAVAILABLE[name] ?? name).join(', ')}.`}
      </p>
    </div>
  );
}
