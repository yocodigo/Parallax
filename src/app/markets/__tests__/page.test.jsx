import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from '../page';

vi.mock('@/components/PriceChart', () => ({ default: () => <p>price chart</p> }));
vi.mock('@/components/PortfolioRisk', () => ({ default: () => <p>portfolio risk</p> }));

afterEach(() => vi.unstubAllEnvs());

describe('Home', () => {
  it('shows the chart and the portfolio risk', () => {
    render(<Home />);

    expect(screen.getByText('price chart')).toBeInTheDocument();
    expect(screen.getByText('portfolio risk')).toBeInTheDocument();
  });

  it("leaves out the account's positions in the demo", () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
    render(<Home />);

    expect(screen.getByText('price chart')).toBeInTheDocument();
    expect(screen.queryByText('portfolio risk')).not.toBeInTheDocument();
  });
});
