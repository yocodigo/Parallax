import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ModeComparison from '../ModeComparison';

const none = {
  trades: 0,
  winRate: null,
  netExpectancy: null,
  netProfitFactor: null,
  avgWin: null,
  avgLoss: null,
};

const modes = {
  live: { trades: 12, winRate: 7 / 12, netExpectancy: 9.5, netProfitFactor: 1.8, avgWin: 30, avgLoss: -12 },
  paper: { trades: 4, winRate: 0.75, netExpectancy: -2.25, netProfitFactor: 0.9, avgWin: 20, avgLoss: -45 },
  backtest: none,
};

// The values in a row, left to right: live, paper, backtest.
const valuesOf = (label) =>
  within(screen.getByRole('row', { name: new RegExp(`^${label}`) }))
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

describe('ModeComparison', () => {
  it('sets live, paper, and backtest side by side, each figure labelled net or gross', () => {
    render(<ModeComparison modes={modes} />);

    expect(screen.getByRole('heading', { name: 'Mode comparison' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Live', 'Paper', 'Backtest']);
    expect(valuesOf('Trades')).toEqual(['12', '4', '0']);
    expect(valuesOf('Win rate \\(gross P/L\\)')).toEqual(['58%', '75%', '–']);
    expect(valuesOf('Expectancy \\(net\\)')).toEqual(['+$9.50', '-$2.25', '–']);
    expect(valuesOf('Profit factor \\(net\\)')).toEqual(['1.80', '0.90', '–']);
    expect(valuesOf('Avg win \\(gross\\)')).toEqual(['+$30.00', '+$20.00', '–']);
    expect(valuesOf('Avg loss \\(gross\\)')).toEqual(['-$12.00', '-$45.00', '–']);
  });

  it('says why the modes are kept apart, since paper and backtest run optimistic', () => {
    render(<ModeComparison modes={modes} />);

    expect(screen.getByText(/skip spread, slippage, and emotion/)).toBeInTheDocument();
  });

  it('says so when no mode has a closed trade, instead of a table of dashes', () => {
    render(<ModeComparison modes={{ live: none, paper: none, backtest: none }} />);

    expect(screen.getByText('No closed trades yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
