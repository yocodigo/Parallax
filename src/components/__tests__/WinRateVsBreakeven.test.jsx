import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WinRateVsBreakeven, { WinRateTooltip } from '../WinRateVsBreakeven';

const month = (month, winRate, breakevenWinRate, extra = {}) => ({
  month,
  winRate,
  breakevenWinRate,
  trades: 10,
  ...extra,
});

describe('WinRateVsBreakeven', () => {
  it('counts the months the win rate beat breakeven, in words', () => {
    render(
      <WinRateVsBreakeven
        months={[month('2026-01', 0.6, 0.45), month('2026-02', 0.4, 0.5), month('2026-03', 0.5, 0.3)]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Win rate vs breakeven' })).toBeInTheDocument();
    expect(screen.getByText('Win rate was above breakeven in 2 of 3 months.')).toBeInTheDocument();
  });

  it('leaves out months with no breakeven rate, which needs both a win and a loss', () => {
    render(<WinRateVsBreakeven months={[month('2026-01', 1, null), month('2026-02', 0.6, 0.45)]} />);

    expect(
      screen.getByText('Win rate was above breakeven in 1 of 1 month. 1 month had no breakeven rate (no wins or no losses).')
    ).toBeInTheDocument();
  });

  it('says so when no month has a breakeven rate', () => {
    render(<WinRateVsBreakeven months={[month('2026-01', 0, null)]} />);

    expect(screen.getByText('No month had both a win and a loss, so there is no breakeven rate to compare.')).toBeInTheDocument();
  });

  it('says the rates are gross and that scratches count as trades', () => {
    render(<WinRateVsBreakeven months={[month('2026-01', 0.6, 0.45)]} />);

    expect(screen.getByText(/judged on gross P\/L/)).toBeInTheDocument();
    expect(screen.getByText(/scratches count as trades/)).toBeInTheDocument();
  });

  it('says so when there are no closed trades, instead of drawing empty axes', () => {
    render(<WinRateVsBreakeven months={[]} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});

describe('WinRateTooltip', () => {
  const at = (column) => ({ active: true, payload: [{ payload: column }] });

  it('leads with the win rate, then the breakeven rate and the month', () => {
    render(<WinRateTooltip {...at({ month: '2026-07', winRate: 0.5714, breakevenWinRate: 0.4286, trades: 14 })} />);

    expect(screen.getByText('57% win rate')).toBeInTheDocument();
    expect(screen.getByText('43% needed to break even')).toBeInTheDocument();
    expect(screen.getByText('July 2026 · 14 trades')).toBeInTheDocument();
  });

  it('says when a month has no breakeven rate', () => {
    render(<WinRateTooltip {...at({ month: '2026-07', winRate: 1, breakevenWinRate: null, trades: 3 })} />);

    expect(screen.getByText('100% win rate')).toBeInTheDocument();
    expect(screen.getByText('No breakeven rate: needs a win and a loss')).toBeInTheDocument();
  });

  it('says a month had no trades', () => {
    render(<WinRateTooltip {...at({ month: '2026-04', winRate: null })} />);

    expect(screen.getByText('April 2026')).toBeInTheDocument();
    expect(screen.getByText('No trades')).toBeInTheDocument();
  });

  it('renders nothing while the pointer is off the chart', () => {
    const { container } = render(<WinRateTooltip active={false} payload={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
