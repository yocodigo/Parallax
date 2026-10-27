'use client';

// Renders a correlation matrix as a colored grid. Green = positive,
// red = negative, faint = uncorrelated. Purely presentational: it
// receives the matrix from a parent and renders it.
// The theme's green or red at an opacity that grows with the correlation's
// strength (value in [-1, 1]). Capped at 0.45 so the number on the cell stays
// readable in light and dark mode.
const MAX_OPACITY = 0.45;

export function cellColor(value) {
  const magnitude = Math.min(Math.abs(value), 1);
  const color = value >= 0 ? 'green' : 'red';
  // Rounded to 3 decimals so float noise (0.22500000000000003) stays out of the CSS.
  const opacity = Math.round(magnitude * MAX_OPACITY * 1000) / 1000;
  return `rgb(var(--color-${color}-600) / ${opacity})`;
}

export default function CorrelationHeatmap({ matrix }) {
  const symbols = Object.keys(matrix || {});
  if (symbols.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">
        Return correlation
      </h2>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs tabular-nums">
          <thead>
            <tr>
              <th className="p-2" />
              {symbols.map((s) => (
                <th key={s} className="p-2 font-medium text-gray-500">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {symbols.map((rowSym) => (
              <tr key={rowSym}>
                <td className="p-2 font-medium text-gray-500">{rowSym}</td>
                {symbols.map((colSym) => {
                  const v = matrix[rowSym][colSym];
                  return (
                    <td
                      key={colSym}
                      className="p-2 text-center text-gray-800"
                      style={{ backgroundColor: cellColor(v) }}
                      title={`${rowSym} vs ${colSym}: ${v.toFixed(2)}`}
                    >
                      {v.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        Pearson correlation of daily returns over the selected window.
        Values near 1 move together; near −1 move opposite.
      </p>
    </div>
  );
}