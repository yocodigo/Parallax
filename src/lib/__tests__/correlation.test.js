import { describe, it, expect } from 'vitest';
import { periodReturns, correlationMatrix, rollingCorrelation, ROLL } from '../correlation';

describe('periodReturns', () => {
  it('computes period-over-period returns', () => {
    expect(periodReturns([100, 110, 99])).toEqual([0.1, -0.1]);
  });
  it('returns empty for fewer than two points', () => {
    expect(periodReturns([100])).toEqual([]);
  });
});

describe('correlationMatrix', () => {
  it('gives 1.0 on the diagonal', () => {
    const m = correlationMatrix({ AAPL: [1, 2, 3, 4], MSFT: [2, 1, 4, 3] });
    expect(m.AAPL.AAPL).toBeCloseTo(1);
    expect(m.MSFT.MSFT).toBeCloseTo(1);
  });
  it('detects perfect positive correlation', () => {
    const m = correlationMatrix({ A: [1, 2, 3, 4], B: [10, 20, 30, 40] });
    expect(m.A.B).toBeCloseTo(1);
  });
  it('detects perfect negative correlation of returns', () => {
    const A = [100, 110, 121, 133.1];
    const B = [100, 90, 81, 72.9];
    const m = correlationMatrix({ A, B });
    expect(m.A.B).toBeCloseTo(-1, 1);
  });
  it('correlates returns, not raw prices', () => {
    const m = correlationMatrix({ A: [1, 2, 3, 4], B: [4, 3, 2, 1] });
    expect(m.A.B).not.toBeCloseTo(-1);
  });
});

describe('rollingCorrelation', () => {
  // Closes that rise and fall together, with a different size each bar so the
  // returns have some spread.
  const together = (n) => {
    let price = 100;
    return Array.from({ length: n }, (_, i) => (price *= 1 + (i % 3 === 0 ? 0.02 : -0.01)));
  };
  const rows = (a, b) => a.map((value, i) => ({ date: `d${i}`, A: value, B: b[i] }));

  it('trails 20 bars by default', () => {
    expect(ROLL).toBe(20);
  });

  it('has no value until a full window of returns exists', () => {
    const a = together(8);
    const result = rollingCorrelation(rows(a, a), 'A', 'B', 5);

    // 8 closes make 7 returns; the first full window of 5 ends at the 6th close.
    expect(result.map((r) => r.date)).toEqual(['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']);
    expect(result.map((r) => r.correlation === null)).toEqual([true, true, true, true, true, false, false, false]);
  });

  it('is 1 for lines that move together and -1 for ones that mirror each other', () => {
    const a = together(10);
    const mirror = a.map((value, i) => (i === 0 ? 100 : 0)).reduce((closes, _, i) => {
      closes.push(i === 0 ? 100 : closes[i - 1] * (1 - (a[i] - a[i - 1]) / a[i - 1]));
      return closes;
    }, []);

    const same = rollingCorrelation(rows(a, a), 'A', 'B', 5);
    const opposite = rollingCorrelation(rows(a, mirror), 'A', 'B', 5);

    expect(same.at(-1).correlation).toBeCloseTo(1);
    expect(opposite.at(-1).correlation).toBeCloseTo(-1, 1);
  });

  it('shows when a relationship broke, which one whole-window number hides', () => {
    // Together for 10 bars, then B moves against A for 10 more.
    const a = together(20);
    const b = [...a.slice(0, 10)];
    for (let i = 10; i < 20; i++) b.push(b[i - 1] * (1 - (a[i] - a[i - 1]) / a[i - 1]));

    const result = rollingCorrelation(rows(a, b), 'A', 'B', 5);

    expect(result[8].correlation).toBeCloseTo(1);
    expect(result[19].correlation).toBeCloseTo(-1, 1);
  });

  it('uses only the bars where both symbols have a price', () => {
    const a = together(8);
    const data = rows(a, a);
    data[3] = { date: 'd3', A: a[3] };

    const result = rollingCorrelation(data, 'A', 'B', 5);

    expect(result.map((r) => r.date)).not.toContain('d3');
    expect(result).toHaveLength(7);
  });

  it('is all gaps when there are fewer bars than a window', () => {
    const a = together(4);

    expect(rollingCorrelation(rows(a, a), 'A', 'B', 5).every((r) => r.correlation === null)).toBe(true);
  });
});
