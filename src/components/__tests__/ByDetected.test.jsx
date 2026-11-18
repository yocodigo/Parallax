import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ByDetected from '../ByDetected';

const row = (detector, trades, netPnl) => ({ detector, trades, netPnl, winRate: 0.5, netExpectancy: netPnl / trades });

describe('ByDetected', () => {
  it('compares each detected setup, then any setup against none, in words', () => {
    render(
      <ByDetected
        detected={{ rows: [row('band_cross', 2, 60), row('four_touch', 1, -10), row('any', 3, 50), row('none', 4, -40)], unknown: 0 }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Results by detected setup' })).toBeInTheDocument();
    expect(
      screen.getByText('15m band cross: +$60.00. Four-touch break: -$10.00. Any setup: +$50.00. No setup detected: -$40.00.')
    ).toBeInTheDocument();
  });

  it('says how many trades had no detected setups stored, since that is not "no setup"', () => {
    render(<ByDetected detected={{ rows: [row('none', 1, 20)], unknown: 3 }} />);

    expect(
      screen.getByText('3 trades have no detected setups stored: no context, one from before setups were detected, or no minute bars.')
    ).toBeInTheDocument();
  });

  it('says so when no trade has detected setups stored, instead of drawing empty axes', () => {
    render(<ByDetected detected={{ rows: [], unknown: 0 }} />);

    expect(screen.getByText('No trades with detected setups in this range.')).toBeInTheDocument();
  });
});
