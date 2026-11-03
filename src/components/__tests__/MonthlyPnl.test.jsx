import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import MonthlyPnl, { MonthTooltip } from '../MonthlyPnl';

const month = (month, netPnl, extra = {}) => ({
  month,
  netPnl,
  trades: 4,
  winRate: 0.5,
  fees: 2.6,
  ...extra,
});

describe('MonthlyPnl', () => {
  it('sums up the months in words, best and worst included', () => {
    render(
      <MonthlyPnl months={[month('2026-01', 120.5), month('2026-02', -45), month('2026-04', 300), month('2026-05', 0)]} />
    );

    expect(screen.getByRole('heading', { name: 'Net P/L by month' })).toBeInTheDocument();
    expect(
      screen.getByText('Jan to May 2026: 2 months up, 1 down. Best: Apr, +$300.00. Worst: Feb, -$45.00.')
    ).toBeInTheDocument();
  });

  it('names the years when the months cross one, and leaves out a worst month with no loss', () => {
    render(<MonthlyPnl months={[month('2025-12', 80), month('2026-01', 20)]} />);

    expect(screen.getByText('Dec 2025 to Jan 2026: 2 months up, 0 down. Best: Dec 2025, +$80.00.')).toBeInTheDocument();
  });

  it('describes a single month', () => {
    render(<MonthlyPnl months={[month('2026-03', -12)]} />);

    expect(screen.getByText('Mar 2026: 0 months up, 1 down. Worst: Mar, -$12.00.')).toBeInTheDocument();
  });

  it('says so when there are no closed trades, instead of drawing empty axes', () => {
    render(<MonthlyPnl months={[]} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});

describe('MonthTooltip', () => {
  const at = (column) => ({ active: true, payload: [{ payload: column }] });

  it('leads with the net P/L, then the month, trades, win rate, and fees', () => {
    render(<MonthTooltip {...at({ month: '2026-07', label: 'Jul', netPnl: 420, trades: 14, winRate: 0.5714, fees: 12.4 })} />);

    expect(screen.getByText('+$420.00')).toBeInTheDocument();
    expect(screen.getByText('July 2026 · 14 trades')).toBeInTheDocument();
    expect(screen.getByText('57% won · $12.40 in fees')).toBeInTheDocument();
  });

  it('says a month had no trades', () => {
    render(<MonthTooltip {...at({ month: '2026-04', label: 'Apr', netPnl: null })} />);

    expect(screen.getByText('April 2026')).toBeInTheDocument();
    expect(screen.getByText('No trades')).toBeInTheDocument();
  });

  it('renders nothing while the pointer is off the chart', () => {
    const { container } = render(<MonthTooltip active={false} payload={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
