import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import EquityCurve, { EquityTooltip } from '../EquityCurve';

const points = [
  { closedAt: '2026-03-10T20:00:00.000Z', cumulative: 30, drawdown: 0 },
  { closedAt: '2026-04-13T20:00:00.000Z', cumulative: 18.7, drawdown: 11.3 },
];

describe('EquityCurve', () => {
  it('sums up the curve in words, so no value needs the chart to be read', () => {
    render(<EquityCurve points={points} />);

    expect(screen.getByRole('heading', { name: 'Equity curve' })).toBeInTheDocument();
    expect(
      screen.getByText('2 trades from Mar 10 to Apr 13, 2026, ending at +$18.70. Deepest drawdown: -$11.30.')
    ).toBeInTheDocument();
  });

  it('names both years when the trades span two', () => {
    render(
      <EquityCurve
        points={[
          { closedAt: '2025-12-30T20:00:00.000Z', cumulative: 30, drawdown: 0 },
          { closedAt: '2026-01-02T20:00:00.000Z', cumulative: 50, drawdown: 0 },
        ]}
      />
    );

    expect(
      screen.getByText('2 trades from Dec 30, 2025 to Jan 2, 2026, ending at +$50.00. No drawdown.')
    ).toBeInTheDocument();
  });

  it('describes a single trade by its day', () => {
    render(<EquityCurve points={points.slice(0, 1)} />);

    expect(screen.getByText('1 trade on Mar 10, 2026, ending at +$30.00. No drawdown.')).toBeInTheDocument();
  });

  it('says so when there are no closed trades, instead of drawing empty axes', () => {
    render(<EquityCurve points={[]} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});

describe('EquityTooltip', () => {
  const at = (point, index) => ({ active: true, payload: [{ payload: { ...point, index } }] });

  it('leads with the running P/L, then the trade, its close in New York, and the drawdown', () => {
    render(<EquityTooltip {...at(points[1], 1)} />);

    expect(screen.getByText('+$18.70')).toBeInTheDocument();
    expect(screen.getByText('Trade 2 · Mon, Apr 13, 4:00 PM ET')).toBeInTheDocument();
    expect(screen.getByText('-$11.30 from peak')).toBeInTheDocument();
  });

  it('says the curve is at its peak when there is no drawdown', () => {
    render(<EquityTooltip {...at(points[0], 0)} />);

    expect(screen.getByText('At peak')).toBeInTheDocument();
  });

  it('renders nothing while the pointer is off the chart', () => {
    const { container } = render(<EquityTooltip active={false} payload={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
