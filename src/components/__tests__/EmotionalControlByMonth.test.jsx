import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmotionalControlByMonth, { EmotionalControlTooltip } from '../EmotionalControlByMonth';

const month = (month, netPnl, trades = 5) => ({ month, netPnl, trades });
const rating = (month, average, reviews = 1) => ({ month, average, reviews });

describe('EmotionalControlByMonth', () => {
  it('gives the overall average and the best and worst month, in words', () => {
    render(
      <EmotionalControlByMonth
        months={[month('2026-01', 100), month('2026-02', -50)]}
        ratings={[rating('2026-01', 8, 3), rating('2026-02', 4, 1)]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Emotional control by month' })).toBeInTheDocument();
    expect(
      screen.getByText('Overall 7.0 of 10 across 4 reviews. Best month: January 2026, 8.0. Worst: February 2026, 4.0.')
    ).toBeInTheDocument();
  });

  it('says so when no review was rated, and when there are no closed trades', () => {
    const { rerender } = render(<EmotionalControlByMonth months={[month('2026-01', 100)]} ratings={[]} />);
    expect(screen.getByText('No review in this range has an emotional-control rating.')).toBeInTheDocument();

    rerender(<EmotionalControlByMonth months={[]} ratings={[]} />);
    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});

describe('EmotionalControlTooltip', () => {
  const at = (column) => ({ active: true, payload: [{ payload: column }] });

  it('leads with the average, then the reviews, the month, and what it made', () => {
    render(<EmotionalControlTooltip {...at({ month: '2026-07', average: 6.5, reviews: 2, netPnl: -40, trades: 6 })} />);

    expect(screen.getByText('6.5 of 10')).toBeInTheDocument();
    expect(screen.getByText('2 reviews')).toBeInTheDocument();
    expect(screen.getByText(/July 2026 · 6 trades/)).toBeInTheDocument();
  });

  it('says a month has no rating, or no trades', () => {
    const { rerender } = render(<EmotionalControlTooltip {...at({ month: '2026-07', average: null, netPnl: 10, trades: 1 })} />);
    expect(screen.getByText('No rating: no review was rated')).toBeInTheDocument();

    rerender(<EmotionalControlTooltip {...at({ month: '2026-08', average: null, netPnl: null })} />);
    expect(screen.getByText('No trades')).toBeInTheDocument();
  });
});
