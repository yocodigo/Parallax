import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import PerformanceTables from '../PerformanceTables';

const summary = (extra = {}) => ({
  trades: 4,
  wins: 2,
  losses: 1,
  scratches: 1,
  winRate: 0.5,
  breakevenWinRate: 0.4,
  avgWin: 30,
  avgLoss: -20,
  payoffRatio: 1.5,
  grossPnl: 40,
  fees: 2.6,
  netPnl: 37.4,
  profitFactor: 3,
  netProfitFactor: 2.8,
  expectancy: 10,
  netExpectancy: 9.35,
  ...extra,
});

const adherence = {
  trades: 6,
  window: { ok: 4, missed: 2, cost: -55.5 },
  size: { ok: 5, missed: 1, cost: -12 },
};

const months = [
  { month: '2026-03', ...summary() },
  { month: '2026-04', ...summary({ trades: 2, winRate: null, profitFactor: null, avgLoss: null, payoffRatio: null }) },
];

function renderTables(props = {}) {
  return render(<PerformanceTables months={months} yearToDate={summary({ trades: 6 })} adherence={adherence} rangeLabel="2026" {...props} />);
}

describe('PerformanceTables', () => {
  it('lists each month on a row, in the order given, named for its month and year', () => {
    renderTables();
    const table = screen.getByRole('table', { name: 'Monthly summary' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + two months
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('Mar 2026');
    expect(within(rows[2]).getByRole('rowheader')).toHaveTextContent('Apr 2026');
  });

  it('labels gross and net columns separately, so neither is mistaken for the other', () => {
    renderTables();
    const table = screen.getByRole('table', { name: 'Monthly summary' });
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'Month',
      'Trades',
      'Wins',
      'Losses',
      'Scratches',
      'Win rate',
      'Breakeven win rate',
      'Avg win',
      'Avg loss',
      'Payoff ratio',
      'Gross P/L',
      'Fees',
      'Net P/L',
      'Profit factor (gross)',
      'Profit factor (net)',
      'Expectancy (gross)',
      'Expectancy (net)',
    ]);
  });

  it('aligns the first column’s header left, with its row names, and the figures’ headers right', () => {
    renderTables();
    const [first, second] = within(screen.getByRole('table', { name: 'Monthly summary' })).getAllByRole('columnheader');
    // Conflicting text-left and text-right classes resolve by stylesheet order, so a header may carry only one.
    expect(first).toHaveClass('text-left');
    expect(first).not.toHaveClass('text-right');
    expect(second).toHaveClass('text-right');
    expect(second).not.toHaveClass('text-left');
  });

  it('shows a month’s figures formatted, and a dash for one that can’t be worked out', () => {
    renderTables();
    const [, march, april] = within(screen.getByRole('table', { name: 'Monthly summary' })).getAllByRole('row');
    const cells = (row) => within(row).getAllByRole('cell').map((c) => c.textContent);
    expect(cells(march)).toEqual([
      '4', '2', '1', '1', '50%', '40%', '+$30.00', '-$20.00', '1.50', '+$40.00', '$2.60', '+$37.40', '3.00', '2.80', '+$10.00', '+$9.35',
    ]);
    // Win rate, profit factor, avg loss, and payoff ratio are dashes, not zeros.
    expect(cells(april).filter((c) => c === '–')).toHaveLength(4);
  });

  it('shows the totals as one row of the same columns, named for the range', () => {
    renderTables();
    const table = screen.getByRole('table', { name: 'Totals' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('2026');
    expect(within(rows[1]).getAllByRole('cell')[0]).toHaveTextContent('6');
  });

  it('says there are no months to list when none closed', () => {
    renderTables({ months: [] });
    expect(screen.queryByRole('table', { name: 'Monthly summary' })).not.toBeInTheDocument();
    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });

  it('shows the rules kept and broken with the cost of the broken ones, for option trades', () => {
    renderTables();
    const table = screen.getByRole('table', { name: 'Rule adherence' });
    const [, windowRow, sizeRow] = within(table).getAllByRole('row');
    expect(within(windowRow).getByRole('rowheader')).toHaveTextContent('Window OK');
    expect(within(windowRow).getAllByRole('cell').map((c) => c.textContent)).toEqual(['4', '2', '67%', '-$55.50']);
    expect(within(sizeRow).getByRole('rowheader')).toHaveTextContent('Size OK');
    expect(within(sizeRow).getAllByRole('cell').map((c) => c.textContent)).toEqual(['5', '1', '83%', '-$12.00']);
    expect(screen.getByText(/option trades only/i)).toBeInTheDocument();
  });

  it('shows a dash for the kept share when no trade could be judged', () => {
    const empty = { ok: 0, missed: 0, cost: 0 };
    renderTables({ adherence: { trades: 0, window: empty, size: empty } });
    const [, windowRow] = within(screen.getByRole('table', { name: 'Rule adherence' })).getAllByRole('row');
    expect(within(windowRow).getAllByRole('cell')[2]).toHaveTextContent('–');
  });
});
