import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Rules from '../page';

vi.mock('@/components/Strategies', () => ({ default: () => <p>strategies</p> }));
vi.mock('@/components/RuleSettings', () => ({ default: () => <p>rule settings</p> }));
vi.mock('@/components/CircuitBreakers', () => ({ default: () => <p>circuit breakers</p> }));

describe('Rules', () => {
  it('holds the strategies, the option rule settings, and the circuit breakers', () => {
    render(<Rules />);

    expect(screen.getByRole('heading', { level: 1, name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByText('strategies')).toBeInTheDocument();
    expect(screen.getByText('rule settings')).toBeInTheDocument();
    expect(screen.getByText('circuit breakers')).toBeInTheDocument();
  });
});
