'use client';

import useSWR from 'swr';

const fetcher = async (url) => {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
};

export default function PortfolioRisk() {
  const { data, error, isLoading } = useSWR('/api/positions', fetcher, {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading positions…</div>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error.message}
      </div>
    );
  }

  const positions = data?.positions || [];
  if (positions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        No open positions.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Portfolio risk</h2>
        {data.top && (
          <span className="text-xs text-gray-500">
            Largest: {data.top.symbol} ({(data.top.weight * 100).toFixed(1)}%)
          </span>
        )}
      </div>
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-1 font-medium">Symbol</th>
            <th className="py-1 text-right font-medium">Weight</th>
            <th className="py-1 text-right font-medium">Mkt value</th>
            <th className="py-1 text-right font-medium">Unreal. P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.symbol} className="border-t border-gray-100">
              <td className="py-1.5 font-medium text-gray-800">{p.symbol}</td>
              <td className="py-1.5 text-right text-gray-600">
                {((data.weights[p.symbol] || 0) * 100).toFixed(1)}%
              </td>
              <td className="py-1.5 text-right text-gray-600">
                ${p.marketValue.toFixed(2)}
              </td>
              <td
                className={`py-1.5 text-right ${
                  p.unrealizedPl >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {p.unrealizedPl >= 0 ? '+' : ''}
                {p.unrealizedPlPct.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-gray-400">
        Weights show concentration by market value. This describes your
        portfolio; it is not investment advice.
      </p>
    </div>
  );
}