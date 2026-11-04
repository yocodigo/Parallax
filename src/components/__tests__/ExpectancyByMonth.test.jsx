import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExpectancyByMonth, { ExpectancyTooltip } from '../ExpectancyByMonth';

const month = (month, netExpectancy, extra = {}) => ({
  month,
  netExpectancy,
  expectancy: netExpectancy + 1,
  trades: 10,
  ...extra,
});

describe('ExpectancyByMonth', () => {
  it('counts the months with a positive net expectancy, best and worst included', () => {
    render(
      <ExpectancyByMonth months={[month('2026-01', 12.5), month('2026-02', -4), month('2026-03', 30), month('2026-04', 0)]} />
    );

    expect(screen.getByRole('heading', { name: 'Expectancy by month' })).toBeInTheDocument();
    expect(
      screen.getByText('Net expectancy per trade was positive in 2 of 4 months. Best: Mar, +$30.00. Worst: Feb, -$4.00.')
    ).toBeInTheDocument();
  });

  it('leaves out a worst month that did not lose, and a best month that did not gain', () => {
    render(<ExpectancyByMonth months={[month('2026-01', 5), month('2026-02', 2)]} />);
    expect(
      screen.getByText('Net expectancy per trade was positive in 2 of 2 months. Best: Jan, +$5.00.')
    ).toBeInTheDocument();
  });

  it('says so when there are no closed trades, instead of drawing empty axes', () => {
    render(<ExpectancyByMonth months={[]} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});

describe('ExpectancyTooltip', () => {
  const at = (column) => ({ active: true, payload: [{ payload: column }] });

  it('leads with net expectancy, then gross, the month, and its trades', () => {
    render(<ExpectancyTooltip {...at({ month: '2026-07', netExpectancy: 8.4, expectancy: 9.1, trades: 14 })} />);

    expect(screen.getByText('+$8.40 net')).toBeInTheDocument();
    expect(screen.getByText('+$9.10 gross')).toBeInTheDocument();
    expect(screen.getByText('July 2026 · 14 trades')).toBeInTheDocument();
  });

  it('says a month had no trades', () => {
    render(<ExpectancyTooltip {...at({ month: '2026-04' })} />);

    expect(screen.getByText('April 2026')).toBeInTheDocument();
    expect(screen.getByText('No trades')).toBeInTheDocument();
  });

  it('renders nothing while the pointer is off the chart', () => {
    const { container } = render(<ExpectancyTooltip active={false} payload={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
