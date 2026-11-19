import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlansVsNoPlan from '../PlansVsNoPlan';

const row = (planned, trades, netPnl, winRate = 0.5) => ({
  planned,
  trades,
  netPnl,
  winRate: trades ? winRate : null,
  netExpectancy: trades ? netPnl / trades : null,
});

describe('PlansVsNoPlan', () => {
  it('compares trades with a plan written before the fill against those without, in a table', () => {
    render(<PlansVsNoPlan rows={[row(true, 4, 80, 0.75), row(false, 2, -30)]} />);

    expect(screen.getByRole('heading', { name: 'Plan vs no plan' })).toBeInTheDocument();
    const planned = screen.getByRole('row', { name: /Plan written first/ });
    expect(planned).toHaveTextContent('4');
    expect(planned).toHaveTextContent('+$80.00');
    expect(planned).toHaveTextContent('75%');
    expect(planned).toHaveTextContent('+$20.00');
    expect(screen.getByRole('row', { name: /No plan before the fill/ })).toHaveTextContent('-$30.00');
  });

  it('shows a dash for a side with no trades', () => {
    render(<PlansVsNoPlan rows={[row(true, 1, 10), row(false, 0, 0)]} />);

    expect(screen.getByRole('row', { name: /No plan before the fill/ })).toHaveTextContent('—');
  });

  it('says so when there are no closed trades', () => {
    render(<PlansVsNoPlan rows={[row(true, 0, 0), row(false, 0, 0)]} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});
