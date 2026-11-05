import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DrawdownCurve, { DrawdownTooltip } from '../DrawdownCurve';

const point = (closedAt, cumulative, drawdown) => ({ closedAt, cumulative, drawdown });
const points = [
  point('2026-03-10T20:00:00.000Z', 30, 0),
  point('2026-03-11T20:00:00.000Z', 10, 20),
  point('2026-03-12T20:00:00.000Z', -20, 50),
  point('2026-03-13T20:00:00.000Z', 20, 10),
];

describe('DrawdownCurve', () => {
  it('names the deepest drawdown and where the account stands now, in words', () => {
    render(<DrawdownCurve points={points} />);

    expect(screen.getByRole('heading', { name: 'Drawdown' })).toBeInTheDocument();
    expect(
      screen.getByText('Deepest drawdown: -$50.00, after trade 3 (Mar 12, 2026). Now -$10.00 from the peak.')
    ).toBeInTheDocument();
  });

  it('says so when the account ends at its peak', () => {
    render(
      <DrawdownCurve
        points={[point('2026-03-11T20:00:00.000Z', 25, 5), point('2026-03-12T20:00:00.000Z', 40, 0)]}
      />
    );

    expect(
      screen.getByText('Deepest drawdown: -$5.00, after trade 1 (Mar 11, 2026). Now at the peak.')
    ).toBeInTheDocument();
  });

  it('says so when the account never fell below its peak', () => {
    render(<DrawdownCurve points={[points[0], point('2026-03-11T20:00:00.000Z', 45, 0)]} />);

    expect(screen.getByText('No drawdown: the account never fell below its peak.')).toBeInTheDocument();
  });

  it('explains what the line measures', () => {
    render(<DrawdownCurve points={points} />);

    expect(screen.getByText(/below its running peak/)).toBeInTheDocument();
  });

  it('says so when there are no closed trades, instead of drawing empty axes', () => {
    render(<DrawdownCurve points={[]} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});

describe('DrawdownTooltip', () => {
  const at = (p, index) => ({ active: true, payload: [{ payload: { ...p, index } }] });

  it('leads with the distance from the peak, then the trade, its close in New York, and the P/L', () => {
    render(<DrawdownTooltip {...at(points[1], 1)} />);

    expect(screen.getByText('-$20.00 from peak')).toBeInTheDocument();
    expect(screen.getByText('Trade 2 · Wed, Mar 11, 4:00 PM ET')).toBeInTheDocument();
    expect(screen.getByText('+$10.00 net P/L')).toBeInTheDocument();
  });

  it('says the account is at its peak when there is no drawdown', () => {
    render(<DrawdownTooltip {...at(points[0], 0)} />);

    expect(screen.getByText('At peak')).toBeInTheDocument();
  });
});
