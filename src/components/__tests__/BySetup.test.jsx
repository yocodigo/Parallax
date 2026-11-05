import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import BySetup, { SetupTooltip } from '../BySetup';

const row = (name, trades, netPnl, strategyId = name) => ({
  strategyId,
  name,
  trades,
  netPnl,
  winRate: 0.5,
  netExpectancy: netPnl / trades,
});

describe('BySetup', () => {
  it('names the best and worst setup, in words', () => {
    render(<BySetup rows={[row('Band cross', 10, 300), row('Four touch', 4, 10), row('Fade', 4, -80)]} />);

    expect(screen.getByRole('heading', { name: 'Results by setup' })).toBeInTheDocument();
    expect(screen.getByText('3 setups. Best: Band cross, +$300.00. Worst: Fade, -$80.00.')).toBeInTheDocument();
  });

  it('calls the trades with no strategy so, and does not rank them best or worst', () => {
    render(<BySetup rows={[row('Band cross', 3, -40), row(null, 5, 500, null)]} />);

    expect(screen.getByText('2 setups. Best: Band cross, -$40.00. No strategy: +$500.00.')).toBeInTheDocument();
  });

  it('says setup for one, and leaves out a worst that did not lose money', () => {
    render(<BySetup rows={[row('Band cross', 3, 40)]} />);

    expect(screen.getByText('1 setup. Best: Band cross, +$40.00.')).toBeInTheDocument();
  });

  it('says so when there are no closed trades, instead of drawing empty axes', () => {
    render(<BySetup rows={[]} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });
});

describe('SetupTooltip', () => {
  it('leads with net P/L, then the setup, trade count, win rate, and expectancy', () => {
    render(<SetupTooltip active payload={[{ payload: { ...row('Band cross', 10, 300), label: 'Band cross' } }]} />);

    expect(screen.getByText('+$300.00')).toBeInTheDocument();
    expect(screen.getByText('Band cross')).toBeInTheDocument();
    expect(screen.getByText('10 trades · 50% win rate · +$30.00 per trade')).toBeInTheDocument();
  });
});
