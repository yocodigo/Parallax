"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { valueTicks } from "@/lib/chartTicks";
import { formatProfitLoss } from "@/lib/format";

const theme = (name) => `rgb(var(--color-${name}))`;

// The same fixed green and red as MonthlyPnl (see the comment there for why
// they are hex). The sign is also carried by the bar's direction from zero and
// by the signed amount under each name, never by color alone.
const GAIN = "#16a34a";
const LOSS = "#dc2626";

// In the order of `violationCosts`, with the names the sentence and chart use.
const BUCKETS = [
  { key: "followed", name: "Rules followed" },
  { key: "window", name: "Lockout only" },
  { key: "size", name: "Size only" },
  { key: "both", name: "Lockout and size" },
];

const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// The buckets in words: the chart's text alternative, shown to everyone.
function summary(rows) {
  return rows
    .map(
      (r) =>
        `${r.name}: ${plural(r.trades, "trade")}, ${formatProfitLoss(r.net)}.`,
    )
    .join(" ");
}

// The hover and keyboard readout: the value first, then what it belongs to.
export function BucketTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, net, trades } = payload[0].payload;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="text-sm font-semibold text-gray-900 tabular-nums">
        {formatProfitLoss(net)}
      </p>
      <p className="mt-0.5 text-gray-500">
        {name} · {plural(trades, "trade")}
      </p>
    </div>
  );
}

// The name with its signed amount under it, so each bar says its own sign.
function NameTick({ x, y, payload, rows }) {
  const row = rows.find((r) => r.name === payload.value);
  return (
    <text x={x} y={y} textAnchor="end" fontSize={11} fill={theme("gray-700")}>
      <tspan x={x} dy="-0.2em">
        {row.name}
      </tspan>
      <tspan x={x} dy="1.3em" fill={theme("gray-500")}>
        {formatProfitLoss(row.net)}
      </tspan>
    </text>
  );
}

// What breaking the entry rules cost (`violationCosts` from the performance
// route): net P/L of option trades by the rules each entry broke. Each trade
// is in one bar, so the bars add up to the total.
export default function MistakeCostLedger({ costs }) {
  const rows = BUCKETS.map(({ key, name }) => ({ name, ...costs[key] })).filter(
    (r) => r.trades > 0,
  );
  const ticks = rows.length
    ? valueTicks(
        Math.min(...rows.map((r) => r.net)),
        Math.max(...rows.map((r) => r.net)),
      )
    : [];

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">
          Mistake cost ledger
        </h2>
        <p className="text-xs text-gray-500">
          Net P/L of option trades by the entry rules broken: lockout window and
          size.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          No closed option trades in this range.
        </p>
      ) : (
        <>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                accessibilityLayer
              >
                <CartesianGrid
                  horizontal={false}
                  verticalValues={ticks}
                  stroke={theme("gray-200")}
                />
                <XAxis
                  type="number"
                  ticks={ticks}
                  domain={[ticks[0], ticks.at(-1)]}
                  interval={0}
                  tickFormatter={(value) => compactMoney.format(value)}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 11,
                    fill: theme("gray-500"),
                    style: { fontVariantNumeric: "tabular-nums" },
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={104}
                  axisLine={false}
                  tickLine={false}
                  tick={<NameTick rows={rows} />}
                />
                <ReferenceLine x={0} stroke={theme("gray-400")} />
                <Tooltip
                  content={<BucketTooltip />}
                  cursor={false}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="net"
                  maxBarSize={22}
                  radius={4}
                  activeBar={{ fillOpacity: 0.75 }}
                  isAnimationActive={false}
                >
                  {rows.map((row) => (
                    <Cell key={row.name} fill={row.net < 0 ? LOSS : GAIN} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(rows)}</p>
        </>
      )}
    </section>
  );
}
