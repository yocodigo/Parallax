import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import GraduationTracker from '../GraduationTracker';

const cell = (trades, window, netExpectancy, met = false) => ({ trades, window, netExpectancy, met });
const noTrades = cell(0, 0, null);

const setups = [
  {
    strategyId: 'a',
    name: 'Trend pullback',
    modes: { backtest: cell(41, 30, 12.5, true), paper: cell(12, 12, 3), live: noTrades },
    gap: null,
  },
  {
    strategyId: 'b',
    name: 'Opening range',
    modes: { backtest: cell(30, 30, -2), paper: cell(30, 30, 40, true), live: cell(5, 5, 0.2 + 0.1) },
    // 0.3 - 40.0 style noise: the page formats it, so it shows as a whole number of cents.
    gap: 0.30000000000000004 - 40,
  },
  { strategyId: null, name: null, modes: { backtest: noTrades, paper: cell(3, 3, 5), live: noTrades }, gap: null },
];

const rowOf = (name) => screen.getByRole('row', { name: new RegExp(`^${name}`) });
const cellsOf = (name) => within(rowOf(name)).getAllByRole('cell');

describe('GraduationTracker', () => {
  it('lists each setup against the three gates, each moving up from the mode before', () => {
    render(<GraduationTracker setups={setups} gradN={30} />);

    expect(screen.getByRole('heading', { name: 'Graduation tracker' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Setup',
      'Backtest → paper',
      'Paper → live',
      'Live → size up',
      'Live − paper gap',
    ]);
  });

  it('says in words whether a gate is met, not met, or still filling, with the expectancy', () => {
    render(<GraduationTracker setups={setups} gradN={30} />);

    const [toPaper, toLive, sizeUp] = cellsOf('Trend pullback');
    expect(toPaper).toHaveTextContent('Met');
    expect(toPaper).toHaveTextContent('+$12.50 per trade');
    expect(toLive).toHaveTextContent('12 of 30 trades');
    expect(toLive).toHaveTextContent('+$3.00 per trade');
    expect(sizeUp).toHaveTextContent('No trades yet');

    const [opening] = cellsOf('Opening range');
    expect(opening).toHaveTextContent('Not met');
    expect(opening).toHaveTextContent('-$2.00 per trade');
  });

  it('takes the window size from the data, not a number of its own', () => {
    render(<GraduationTracker setups={setups} gradN={20} />);

    expect(cellsOf('Trend pullback')[1]).toHaveTextContent('12 of 20 trades');
    expect(screen.getByText(/last 20 closed trades/)).toBeInTheDocument();
  });

  it('shows the live-minus-paper gap per trade, rounded to cents, or a dash with no gap', () => {
    render(<GraduationTracker setups={setups} gradN={30} />);

    expect(cellsOf('Opening range')[3]).toHaveTextContent('-$39.70 per trade');
    expect(cellsOf('Trend pullback')[3]).toHaveTextContent('–');
  });

  it('names the trades without a strategy as such', () => {
    render(<GraduationTracker setups={setups} gradN={30} />);

    expect(within(rowOf('No strategy')).getByRole('rowheader')).toHaveTextContent('No strategy');
  });

  it('says so when nothing has closed, instead of an empty table', () => {
    render(<GraduationTracker setups={[]} gradN={30} />);

    expect(screen.getByText('No closed trades yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
