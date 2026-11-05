import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import FeesVsGross, { FeesTooltip } from '../FeesVsGross';

const month = (month, grossPnl, fees, netPnl = grossPnl - fees) => ({ month, grossPnl, fees, netPnl, trades: 10 });

describe('FeesVsGross', () => {
  it('gives fees as a share of gross profit over the range, in words', () => {
    render(<FeesVsGross months={[month('2026-01', 1000, 40), month('2026-02', 500, 20)]} />);

    expect(screen.getByRole('heading', { name: 'Fees vs gross P/L' })).toBeInTheDocument();
    expect(screen.getByText('Fees took 4.0% of gross P/L: $60.00 of $1,500.00.')).toBeInTheDocument();
  });

  it('says fees added to the loss when gross P/L was not positive', () => {
    render(<FeesVsGross months={[month('2026-01', -200, 30)]} />);

    expect(screen.getByText('Gross P/L was -$200.00, and fees added $30.00 to the loss.')).toBeInTheDocument();
  });

  it('copes with a range that paid no fees', () => {
    render(<FeesVsGross months={[month('2026-01', 200, 0)]} />);

    expect(screen.getByText('Fees took 0.0% of gross P/L: $0.00 of $200.00.')).toBeInTheDocument();
  });

  it('says so when there are no closed trades, instead of drawing empty axes', () => {
    render(<FeesVsGross months={[]} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});

describe('FeesTooltip', () => {
  const at = (column) => ({ active: true, payload: [{ payload: column }] });

  it('leads with gross, then fees with their share, then net and the month', () => {
    render(<FeesTooltip {...at({ month: '2026-07', grossPnl: 800, fees: 32, netPnl: 768, trades: 14 })} />);

    expect(screen.getByText('+$800.00 gross')).toBeInTheDocument();
    expect(screen.getByText('$32.00 fees (4.0% of gross)')).toBeInTheDocument();
    expect(screen.getByText('+$768.00 net')).toBeInTheDocument();
    expect(screen.getByText('July 2026 · 14 trades')).toBeInTheDocument();
  });

  it('leaves out the share when gross was not positive', () => {
    render(<FeesTooltip {...at({ month: '2026-07', grossPnl: -90, fees: 10, netPnl: -100, trades: 3 })} />);

    expect(screen.getByText('-$90.00 gross')).toBeInTheDocument();
    expect(screen.getByText('$10.00 fees')).toBeInTheDocument();
  });

  it('says a month had no trades', () => {
    render(<FeesTooltip {...at({ month: '2026-04', grossPnl: undefined })} />);

    expect(screen.getByText('April 2026')).toBeInTheDocument();
    expect(screen.getByText('No trades')).toBeInTheDocument();
  });
});
