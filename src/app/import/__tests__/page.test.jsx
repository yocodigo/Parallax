import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ImportPage from '../page';

vi.mock('@/components/ThinkorswimImport', () => ({ default: () => <p>thinkorswim import</p> }));
vi.mock('@/components/FidelityImport', () => ({ default: () => <p>fidelity import</p> }));

afterEach(() => vi.unstubAllEnvs());

describe('ImportPage', () => {
  it('offers both imports', () => {
    render(<ImportPage />);

    expect(screen.getByText('thinkorswim import')).toBeInTheDocument();
    expect(screen.getByText('fidelity import')).toBeInTheDocument();
  });

  it('offers neither in the demo, and says why', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
    render(<ImportPage />);

    expect(screen.queryByText('thinkorswim import')).not.toBeInTheDocument();
    expect(screen.queryByText('fidelity import')).not.toBeInTheDocument();
    expect(screen.getByText(/in the demo/i)).toBeInTheDocument();
  });
});
