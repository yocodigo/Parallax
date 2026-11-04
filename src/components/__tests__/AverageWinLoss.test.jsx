import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AverageWinLoss, { AverageTooltip } from '../AverageWinLoss';

const month = (month, avgWin, avgLoss, extra = {}) => ({ month, avgWin, avgLoss, trades: 10, ...extra });

describe('AverageWinLoss', () => {
  it('counts the months the average win was larger than the average loss, in words', () => {
    render(
      <AverageWinLoss
        months={[month('2026-01', 120, -80), month('2026-02', 50, -90), month('2026-03', 200, -100)]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Average win vs average loss' })).toBeInTheDocument();
    expect(screen.getByText('The average win was larger than the average loss in 2 of 3 months.')).toBeInTheDocument();
  });

  it('leaves out months with no wins or no losses, which have nothing to compare', () => {
    render(<AverageWinLoss months={[month('2026-01', 120, null), month('2026-02', 60, -40)]} />);

    expect(
      screen.getByText(
        'The average win was larger than the average loss in 1 of 1 month. 1 month had no wins or no losses to compare.'
      )
    ).toBeInTheDocument();
  });

  it('says so when no month has both', () => {
    render(<AverageWinLoss months={[month('2026-01', null, -40)]} />);

    expect(screen.getByText('No month had both a win and a loss to compare.')).toBeInTheDocument();
  });

  it('says so when there are no closed trades, instead of drawing empty axes', () => {
    render(<AverageWinLoss months={[]} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});

describe('AverageTooltip', () => {
  const at = (column) => ({ active: true, payload: [{ payload: column }] });

  it('leads with the average win and loss, then the month and its trades', () => {
    render(<AverageTooltip {...at({ month: '2026-07', avgWin: 120, avgLoss: -80, trades: 14 })} />);

    expect(screen.getByText('+$120.00 avg win · -$80.00 avg loss')).toBeInTheDocument();
    expect(screen.getByText('July 2026 · 14 trades')).toBeInTheDocument();
  });

  it('says which side a month lacked', () => {
    const { rerender } = render(<AverageTooltip {...at({ month: '2026-07', avgWin: 120, avgLoss: null, trades: 3 })} />);
    expect(screen.getByText('+$120.00 avg win · no losses')).toBeInTheDocument();

    rerender(<AverageTooltip {...at({ month: '2026-07', avgWin: null, avgLoss: -80, trades: 3 })} />);
    expect(screen.getByText('no wins · -$80.00 avg loss')).toBeInTheDocument();
  });

  it('says a month had no trades', () => {
    render(<AverageTooltip {...at({ month: '2026-04' })} />);

    expect(screen.getByText('April 2026')).toBeInTheDocument();
    expect(screen.getByText('No trades')).toBeInTheDocument();
  });

  it('renders nothing while the pointer is off the chart', () => {
    const { container } = render(<AverageTooltip active={false} payload={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
