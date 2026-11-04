import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WinsLossesScratches, { OutcomeTooltip } from '../WinsLossesScratches';

const month = (month, wins, losses, scratches) => ({
  month,
  wins,
  losses,
  scratches,
  trades: wins + losses + scratches,
});

describe('WinsLossesScratches', () => {
  it('totals the range in words, so no count needs the chart to be read', () => {
    render(<WinsLossesScratches months={[month('2026-01', 5, 3, 1), month('2026-02', 2, 4, 0)]} />);

    expect(screen.getByRole('heading', { name: 'Wins, losses, scratches by month' })).toBeInTheDocument();
    expect(screen.getByText('15 trades: 7 won, 7 lost, 1 scratch.')).toBeInTheDocument();
  });

  it('says so when there are no closed trades, instead of drawing empty axes', () => {
    render(<WinsLossesScratches months={[]} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});

describe('OutcomeTooltip', () => {
  const at = (column) => ({ active: true, payload: [{ payload: column }] });

  it('leads with the counts, then the month and its trades', () => {
    render(<OutcomeTooltip {...at({ month: '2026-07', wins: 8, losses: 5, scratches: 1, trades: 14 })} />);

    expect(screen.getByText('8 won · 5 lost · 1 scratch')).toBeInTheDocument();
    expect(screen.getByText('July 2026 · 14 trades')).toBeInTheDocument();
  });

  it('says a month had no trades', () => {
    render(<OutcomeTooltip {...at({ month: '2026-04' })} />);

    expect(screen.getByText('April 2026')).toBeInTheDocument();
    expect(screen.getByText('No trades')).toBeInTheDocument();
  });

  it('renders nothing while the pointer is off the chart', () => {
    const { container } = render(<OutcomeTooltip active={false} payload={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
