import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ByUnderlying, { UnderlyingTooltip } from '../ByUnderlying';

const row = (symbol, trades, netPnl) => ({
  symbol,
  trades,
  netPnl,
  winRate: 0.5,
  netExpectancy: netPnl / trades,
});

describe('ByUnderlying', () => {
  it('names the best and worst symbol, in words', () => {
    render(<ByUnderlying rows={[row('SPY', 10, 300), row('NVDA', 2, 10), row('QQQ', 4, -80)]} />);

    expect(screen.getByRole('heading', { name: 'Results by underlying' })).toBeInTheDocument();
    expect(screen.getByText('3 symbols. Best: SPY, +$300.00. Worst: QQQ, -$80.00.')).toBeInTheDocument();
  });

  it('leaves out a worst symbol that did not lose money, and says symbol for one', () => {
    render(<ByUnderlying rows={[row('SPY', 3, 40)]} />);

    expect(screen.getByText('1 symbol. Best: SPY, +$40.00.')).toBeInTheDocument();
  });

  it('says so when there are no closed trades, instead of drawing empty axes', () => {
    render(<ByUnderlying rows={[]} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});

describe('UnderlyingTooltip', () => {
  it('leads with net P/L, then the symbol, trade count, win rate, and expectancy', () => {
    render(<UnderlyingTooltip active payload={[{ payload: row('SPY', 10, 300) }]} />);

    expect(screen.getByText('+$300.00')).toBeInTheDocument();
    expect(screen.getByText('SPY')).toBeInTheDocument();
    expect(screen.getByText('10 trades · 50% win rate · +$30.00 per trade')).toBeInTheDocument();
  });
});
