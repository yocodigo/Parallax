import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DisciplineByMonth, { DisciplineTooltip } from '../DisciplineByMonth';

const month = (month, netPnl, trades = 5) => ({ month, netPnl, trades });
const score = (month, ok, missed) => ({ month, ok, missed, score: ok + missed ? ok / (ok + missed) : null });

describe('DisciplineByMonth', () => {
  it('gives the range score and the best and worst month, in words', () => {
    render(
      <DisciplineByMonth
        months={[month('2026-01', 100), month('2026-02', -50)]}
        discipline={[score('2026-01', 9, 1), score('2026-02', 3, 3)]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Discipline score by month' })).toBeInTheDocument();
    expect(
      screen.getByText('Overall 75%: 12 of 16 checks passed. Best month: January 2026, 90%. Worst: February 2026, 50%.')
    ).toBeInTheDocument();
  });

  it('names no worst month when there is only one scored month', () => {
    render(<DisciplineByMonth months={[month('2026-01', 100)]} discipline={[score('2026-01', 3, 0)]} />);

    expect(screen.getByText('Overall 100%: 3 of 3 checks passed. Best month: January 2026, 100%.')).toBeInTheDocument();
  });

  it('scores only the months that have a row, and leaves a month of other assets out of the overall', () => {
    render(
      <DisciplineByMonth
        months={[month('2026-01', 100), month('2026-02', 20)]}
        discipline={[score('2026-01', 2, 2)]}
      />
    );

    expect(screen.getByText('Overall 50%: 2 of 4 checks passed. Best month: January 2026, 50%.')).toBeInTheDocument();
  });

  it('says so when no check applied in any month, instead of drawing empty axes', () => {
    render(<DisciplineByMonth months={[month('2026-01', 100)]} discipline={[score('2026-01', 0, 0)]} />);

    expect(screen.getByText('No month had a Plan, Stop, or Exit check to score.')).toBeInTheDocument();
  });

  it('says so when there are no closed trades', () => {
    render(<DisciplineByMonth months={[]} discipline={[]} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});

describe('DisciplineTooltip', () => {
  const at = (column) => ({ active: true, payload: [{ payload: column }] });

  it('leads with the score, then the checks, the month, and what it made', () => {
    render(<DisciplineTooltip {...at({ month: '2026-07', score: 0.75, ok: 9, missed: 3, netPnl: -40, trades: 6 })} />);

    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('9 of 12 checks passed')).toBeInTheDocument();
    expect(screen.getByText('July 2026 · 6 trades · -$40.00 net')).toBeInTheDocument();
  });

  it('says when a month had trades but no check applied', () => {
    render(<DisciplineTooltip {...at({ month: '2026-07', score: null, ok: 0, missed: 0, netPnl: 5, trades: 1 })} />);

    expect(screen.getByText('No score: no check applied')).toBeInTheDocument();
  });

  it('says a month had no trades', () => {
    render(<DisciplineTooltip {...at({ month: '2026-04', netPnl: null })} />);

    expect(screen.getByText('April 2026')).toBeInTheDocument();
    expect(screen.getByText('No trades')).toBeInTheDocument();
  });
});
