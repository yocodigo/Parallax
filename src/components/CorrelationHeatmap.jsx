'use client';

// Renders a correlation matrix as a colored grid. Green = positive,
// red = negative, faint = uncorrelated. Purely presentational: it
// receives the matrix from a parent and renders it.
function cellColor(value) {
  // value in [-1, 1] → hsl. Positive greens, negative reds.
  const magnitude = Math.min(Math.abs(value), 1);
  const hue = value >= 0 ? 152 : 0; // green vs red
  const light = 96 - magnitude * 46; // stronger corr = darker
  return `hsl(${hue} 60% ${light}%)`;
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