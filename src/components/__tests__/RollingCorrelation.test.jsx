import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RollingCorrelation from '../RollingCorrelation';

const series = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-01-${String(i + 1).padStart(2, '0')}`,
  AAPL: 200 + i,
  MSFT: 400 + (i % 4),
  QQQ: 500 + i * 2,
  SPY: 600 + i,
}));

describe('RollingCorrelation', () => {
  it('starts on SPY and QQQ when both are loaded', () => {
    render(<RollingCorrelation series={series} symbols={['AAPL', 'MSFT', 'QQQ', 'SPY']} />);

    expect(screen.getByLabelText('First symbol')).toHaveValue('SPY');
    expect(screen.getByLabelText('Second symbol')).toHaveValue('QQQ');
  });

  it('falls back to the first two symbols otherwise', () => {
    render(<RollingCorrelation series={series} symbols={['AAPL', 'MSFT']} />);

    expect(screen.getByLabelText('First symbol')).toHaveValue('AAPL');
    expect(screen.getByLabelText('Second symbol')).toHaveValue('MSFT');
  });

  it('lets the pair be changed', async () => {
    render(<RollingCorrelation series={series} symbols={['AAPL', 'MSFT', 'SPY']} />);

    await userEvent.selectOptions(screen.getByLabelText('First symbol'), 'MSFT');

    expect(screen.getByLabelText('First symbol')).toHaveValue('MSFT');
  });

  it('says so when there are too few bars for a 20-bar window', () => {
    render(<RollingCorrelation series={series.slice(0, 10)} symbols={['AAPL', 'MSFT']} />);

    expect(screen.getByText(/needs more than 20 bars/i)).toBeInTheDocument();
  });

  it('shows nothing for fewer than two symbols', () => {
    const { container } = render(<RollingCorrelation series={series} symbols={['AAPL']} />);

    expect(container).toBeEmptyDOMElement();
  });
});
