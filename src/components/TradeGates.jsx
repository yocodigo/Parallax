'use client';

import useSWR from 'swr';
import { fetchJson } from '@/lib/fetchJson';
import { formatTradeTime } from '@/lib/format';
import { MET, MISSED } from '@/lib/setups/gates';

// The section 8 table's order; `size` only appears for an option trade
// (gradeGates only grades it there).
const GATE_ORDER = ['window', 'size', 'direction', 'entry', 'location', 'stop', 'target', 'state'];

const GATE_LABELS = {
  window: 'Window',
  size: 'Size',
  direction: 'Direction',
  entry: 'Entry',
  location: 'Location',
  stop: 'Stop',
  target: 'Target',
  state: 'State',
};

const BADGE_STYLES = {
  [MET]: 'bg-green-50 text-green-700',
  [MISSED]: 'bg-red-50 text-red-700',
};
const UNKNOWN_STYLE = 'bg-gray-100 text-gray-500';

const RESULT_WORDS = { [MET]: 'OK', [MISSED]: 'missed' };

function Gate({ name, result }) {
  return (
    <span className={`rounded px-1.5 py-0.5 ${BADGE_STYLES[result] ?? UNKNOWN_STYLE}`}>
      {`${GATE_LABELS[name]} ${RESULT_WORDS[result] ?? '?'}`}
    </span>
  );
}

// The level map's kinds (levels.js) in words. Pools and four-touch lines are
// spelled from their kind: equal_highs_5m reads "5m equal highs".
const LEVEL_WORDS = {
  prior_day_high: 'prior day high',
  prior_day_low: 'prior day low',
  prior_week_high: 'prior week high',
  prior_week_low: 'prior week low',
  asia_high: 'Asia high',
  asia_low: 'Asia low',
  london_high: 'London high',
  london_low: 'London low',
  premarket_high: 'premarket high',
  premarket_low: 'premarket low',
  opening_range_high: 'opening range high',
  opening_range_low: 'opening range low',
  session_high: 'session high',
  session_low: 'session low',
  fib_50: 'fib 50%',
  fib_100: 'fib 100%',
  htf_fib_50: 'second fib 50%',
  htf_fib_100: 'second fib 100%',
  range_50: "dealing range's 50%",
  round: 'round number',
};

// Kinds made of a name and a timeframe, such as equal_highs_5m.
const TIMED_WORDS = { equal_highs: 'equal highs', equal_lows: 'equal lows', four_touch: 'four-touch line' };

function levelWords({ kind, price }) {
  const timed = kind.match(/^(equal_highs|equal_lows|four_touch)_(\d+m)$/);
  const words = timed ? `${timed[2]} ${TIMED_WORDS[timed[1]]}` : (LEVEL_WORDS[kind] ?? kind);
  return `the ${words} ${price.toFixed(2)}`;
}

const EVENT_WORDS = { accepted: 'broken and accepted', swept: 'swept and rejected' };

// [rules-v3 4] Where Location OK was judged, and nothing while it's unknown.
function locationLine(location) {
  if (location?.status === MET) {
    return `At ${levelWords(location.level)}, ${EVENT_WORDS[location.event]} at ${formatTradeTime(location.at)}`;
  }
  if (location?.status === MISSED) return 'Floating: no tier 1 or 2 level nearby had been broken or swept its way';
  return null;
}

// [rules-v3 4] Room to the next untouched level, in points and as a multiple
// of the distance to the stop when there is one.
function roomLine(room) {
  if (!room) return null;
  if (!room.level) return 'Room: no untouched level ahead';
  const base = `Room: ${room.points.toFixed(2)} pts to ${levelWords(room.level)}`;
  return room.ratio === null
    ? `${base} (no stop to compare it with)`
    : `${base}, ${room.ratio.toFixed(1)} times the ${room.risk.toFixed(2)} pts to the stop`;
}

// A recorded trade's pre-entry gates (section 8), graded from its bars, the
// day's plan, and its own plan entry, with where the entry sat among the
// day's levels.
export default function TradeGates({ tradeId }) {
  const { data, error, isLoading } = useSWR(`/api/trades/${tradeId}/gates`, fetchJson, {
    revalidateOnFocus: false,
  });

  if (isLoading) return <p className="text-xs text-gray-500">Loading gates…</p>;
  if (error) return <p className="text-xs text-red-700">{error.message}</p>;

  const { gates, reason, location, room } = data;
  if (!gates) return <p className="text-xs text-gray-500">{reason ?? 'No gates to grade for this trade.'}</p>;

  const levelLines = [locationLine(location), roomLine(room)].filter(Boolean);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5 text-xs">
        {GATE_ORDER.filter((name) => gates[name]).map((name) => (
          <Gate key={name} name={name} result={gates[name]} />
        ))}
      </div>
      {levelLines.map((line) => (
        <p key={line} className="text-xs text-gray-500">
          {line}
        </p>
      ))}
    </div>
  );
}
