import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ByGrade from '../ByGrade';

const row = (grade, trades, netPnl) => ({ grade, trades, netPnl, winRate: 0.5, netExpectancy: netPnl / trades });

describe('ByGrade', () => {
  it('compares the grades in words', () => {
    render(<ByGrade grades={{ rows: [row('A', 4, 200), row('B', 3, -30), row('none', 5, 10)], unknown: 0 }} />);

    expect(screen.getByRole('heading', { name: 'Results by four-touch grade' })).toBeInTheDocument();
    expect(screen.getByText('A line: +$200.00. B line: -$30.00. No line: +$10.00.')).toBeInTheDocument();
  });

  it('says how many trades could not be graded, since a missing context is not "no line"', () => {
    render(<ByGrade grades={{ rows: [row('A', 1, 20)], unknown: 3 }} />);

    expect(screen.getByText('3 trades are not graded: no stored context, or it lacks the minute bars.')).toBeInTheDocument();
  });

  it('says so when there are no graded trades, instead of drawing empty axes', () => {
    render(<ByGrade grades={{ rows: [], unknown: 0 }} />);

    expect(screen.getByText('No graded trades in this range.')).toBeInTheDocument();
  });
});
