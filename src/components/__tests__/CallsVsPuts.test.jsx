import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import CallsVsPuts, { SideTooltip } from '../CallsVsPuts';

const side = (type, trades, netPnl, extra = {}) => ({
  type,
  trades,
  netPnl,
  winRate: trades ? 0.5 : null,
  netExpectancy: trades ? netPnl / trades : null,
  ...extra,
});

describe('CallsVsPuts', () => {
  it('says which side made more, in words', () => {
    render(<CallsVsPuts sides={[side('call', 10, 300), side('put', 4, -80)]} />);

    expect(screen.getByRole('heading', { name: 'Calls vs puts' })).toBeInTheDocument();
    expect(screen.getByText('Calls: +$300.00 over 10 trades. Puts: -$80.00 over 4 trades.')).toBeInTheDocument();
  });

  it('names a side with no trades instead of a dollar figure', () => {
    render(<CallsVsPuts sides={[side('call', 1, 25), side('put', 0, 0)]} />);

    expect(screen.getByText('Calls: +$25.00 over 1 trade. Puts: no trades.')).toBeInTheDocument();
  });

  it('says so when neither side has closed trades, instead of drawing empty axes', () => {
    render(<CallsVsPuts sides={[side('call', 0, 0), side('put', 0, 0)]} />);

    expect(screen.getByText('No closed option trades in this range.')).toBeInTheDocument();
  });
});

describe('SideTooltip', () => {
  const at = (row) => ({ active: true, payload: [{ payload: row }] });

  it('leads with net P/L, then the trade count, win rate, and expectancy', () => {
    render(<SideTooltip {...at({ label: 'Calls', trades: 10, netPnl: 300, winRate: 0.6, netExpectancy: 30 })} />);

    expect(screen.getByText('+$300.00')).toBeInTheDocument();
    expect(screen.getByText('Calls')).toBeInTheDocument();
    expect(screen.getByText('10 trades · 60% win rate · +$30.00 per trade')).toBeInTheDocument();
  });

  it('says a side had no trades', () => {
    render(<SideTooltip {...at({ label: 'Puts', trades: 0, netPnl: 0, winRate: null, netExpectancy: null })} />);

    expect(screen.getByText('No trades')).toBeInTheDocument();
  });
});
