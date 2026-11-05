import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import RDistribution, { BinTooltip } from '../RDistribution';

const bins = [
  { from: -1, to: 0, count: 3 },
  { from: 0, to: 1, count: 1 },
  { from: 1, to: 2, count: 2 },
];

describe('RDistribution', () => {
  it('says how many trades had an R, and how many were losses and wins', () => {
    render(<RDistribution distribution={{ bins, measured: 6, total: 8 }} />);

    expect(screen.getByRole('heading', { name: 'R-multiple distribution' })).toBeInTheDocument();
    expect(screen.getByText('6 of 8 closed trades have an R (the rest have no initial stop). 3 below 0R, 3 at 0R or better.')).toBeInTheDocument();
  });

  it('says every trade when all of them have an R', () => {
    render(<RDistribution distribution={{ bins, measured: 6, total: 6 }} />);

    expect(screen.getByText('All 6 closed trades have an R. 3 below 0R, 3 at 0R or better.')).toBeInTheDocument();
  });

  it('says so when no trade has an R, instead of drawing empty axes', () => {
    render(<RDistribution distribution={{ bins: [], measured: 0, total: 5 }} />);

    expect(screen.getByText('None of the 5 closed trades has an initial stop, so none has an R.')).toBeInTheDocument();
  });

  it('says so when there are no closed trades', () => {
    render(<RDistribution distribution={{ bins: [], measured: 0, total: 0 }} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});

describe('BinTooltip', () => {
  it('leads with the count, then the R range', () => {
    render(<BinTooltip active payload={[{ payload: { from: -1, to: 0, count: 3 } }]} />);

    expect(screen.getByText('3 trades')).toBeInTheDocument();
    expect(screen.getByText('-1R to 0R')).toBeInTheDocument();
  });

  it('says a bin has no trades', () => {
    render(<BinTooltip active payload={[{ payload: { from: 1, to: 2, count: 0 } }]} />);

    expect(screen.getByText('No trades')).toBeInTheDocument();
  });
});
