import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProfitFactorByMonth, { ProfitFactorTooltip } from '../ProfitFactorByMonth';

const month = (month, netProfitFactor, profitFactor = netProfitFactor, extra = {}) => ({
  month,
  netProfitFactor,
  profitFactor,
  trades: 10,
  ...extra,
});

describe('ProfitFactorByMonth', () => {
  it('counts the months above 1.0, in words', () => {
    render(
      <ProfitFactorByMonth
        months={[month('2026-01', 1.8), month('2026-02', 0.6), month('2026-03', 1.1)]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Profit factor by month' })).toBeInTheDocument();
    expect(screen.getByText('Net profit factor was above 1.0 in 2 of 3 months.')).toBeInTheDocument();
  });

  it('leaves out months with no profit factor, which needs a loss or a fee', () => {
    render(<ProfitFactorByMonth months={[month('2026-01', null), month('2026-02', 1.5)]} />);

    expect(
      screen.getByText('Net profit factor was above 1.0 in 1 of 1 month. 1 month had none (no losses or fees).')
    ).toBeInTheDocument();
  });

  it('says so when no month has a profit factor', () => {
    render(<ProfitFactorByMonth months={[month('2026-01', null)]} />);

    expect(screen.getByText('No month had a loss or a fee, so there is no profit factor to compare.')).toBeInTheDocument();
  });

  it('explains the baseline', () => {
    render(<ProfitFactorByMonth months={[month('2026-01', 1.5)]} />);

    expect(screen.getByText(/dashed line is 1\.0/)).toBeInTheDocument();
  });

  it('says so when there are no closed trades, instead of drawing empty axes', () => {
    render(<ProfitFactorByMonth months={[]} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});

describe('ProfitFactorTooltip', () => {
  const at = (column) => ({ active: true, payload: [{ payload: column }] });

  it('leads with the net figure, then gross and the month', () => {
    render(<ProfitFactorTooltip {...at({ month: '2026-07', netProfitFactor: 1.456, profitFactor: 1.62, trades: 14 })} />);

    expect(screen.getByText('1.46 net')).toBeInTheDocument();
    expect(screen.getByText('1.62 gross')).toBeInTheDocument();
    expect(screen.getByText('July 2026 · 14 trades')).toBeInTheDocument();
  });

  it('shows a dash for a gross figure with no losses', () => {
    render(<ProfitFactorTooltip {...at({ month: '2026-07', netProfitFactor: 40, profitFactor: null, trades: 3 })} />);

    expect(screen.getByText('— gross')).toBeInTheDocument();
  });

  it('says a month had no profit factor', () => {
    render(<ProfitFactorTooltip {...at({ month: '2026-07', netProfitFactor: null, profitFactor: null, trades: 3 })} />);

    expect(screen.getByText('No profit factor: needs a loss or a fee')).toBeInTheDocument();
  });

  it('says a month had no trades', () => {
    render(<ProfitFactorTooltip {...at({ month: '2026-04', netProfitFactor: null })} />);

    expect(screen.getByText('April 2026')).toBeInTheDocument();
    expect(screen.getByText('No trades')).toBeInTheDocument();
  });

  it('renders nothing while the pointer is off the chart', () => {
    const { container } = render(<ProfitFactorTooltip active={false} payload={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
